from __future__ import annotations

import copy
import hmac
import logging
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html

from .config import Settings, load_settings
from .contract import OPENAPI_DOCUMENT, validate_payload
from .errors import ContractViolation, PayloadValidationError, ServiceError
from .media import fetch_and_normalize
from .provider import VLMClient
from .service import (
    UNCONFIGURED_VERSION,
    catalog_page,
    capabilities,
    photo_result,
    recalculation_result,
)


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
logger = logging.getLogger("carin.ai_service")
app = FastAPI(title="Carin Internal AI Service", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    request.state.request_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-Id"] = request.state.request_id
    return response


def _error_body(request: Request, error: ServiceError) -> dict[str, Any]:
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    body = {
        "error": {
            "code": error.code,
            "message": error.message,
            "retryable": error.retryable,
            "requestId": request_id,
            "details": error.details,
        }
    }
    validate_payload("Error", body)
    return body


@app.exception_handler(ServiceError)
async def service_error_handler(request: Request, exc: ServiceError) -> JSONResponse:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after is not None else None
    return JSONResponse(status_code=exc.status_code, content=_error_body(request, exc), headers=headers)


@app.exception_handler(PayloadValidationError)
async def payload_error_handler(request: Request, exc: PayloadValidationError) -> JSONResponse:
    error = ServiceError(422, "INVALID_INPUT", "JSON tidak sesuai kontrak Carin AI 1.0.0.", details={"field": exc.field_path})
    return JSONResponse(status_code=error.status_code, content=_error_body(request, error))


@app.exception_handler(ContractViolation)
async def response_contract_error_handler(request: Request, exc: ContractViolation) -> JSONResponse:
    logger.error("response contract violation requestId=%s", getattr(request.state, "request_id", "unknown"))
    error = ServiceError(500, "SERVICE_UNAVAILABLE", "Service gagal membentuk response kontrak.")
    return JSONResponse(status_code=error.status_code, content=_error_body(request, error))


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled service error requestId=%s", getattr(request.state, "request_id", "unknown"))
    error = ServiceError(500, "SERVICE_UNAVAILABLE", "Terjadi kesalahan internal.")
    return JSONResponse(status_code=error.status_code, content=_error_body(request, error))


async def require_service_key(request: Request) -> Settings:
    try:
        settings = load_settings()
    except (ValueError, TypeError):
        raise ServiceError(503, "SERVICE_UNAVAILABLE", "Konfigurasi AI service tidak valid.")
    if not settings.service_key:
        raise ServiceError(503, "SERVICE_UNAVAILABLE", "AI_SERVICE_KEY belum dikonfigurasi.")
    supplied = request.headers.get("X-Carin-Service-Key", "")
    if not supplied or not hmac.compare_digest(supplied, settings.service_key):
        raise ServiceError(401, "INVALID_SERVICE_KEY", "Service key tidak valid.")
    request.state.settings = settings
    return settings


async def _json_body(request: Request, schema_name: str) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception as exc:
        raise ServiceError(400, "INVALID_INPUT", "Body harus berupa JSON yang valid.") from exc
    if not isinstance(payload, dict):
        raise ServiceError(422, "INVALID_INPUT", "Body harus berupa object JSON.")

    # Contract version mismatches are conflicts; malformed field types remain 422.
    if isinstance(payload.get("contractVersion"), str) and payload["contractVersion"] != "1.0.0":
        raise ServiceError(409, "UNSUPPORTED_VERSION", "contractVersion tidak didukung.")
    for key in ("catalogVersion", "ruleSetVersion"):
        value = payload.get(key)
        if isinstance(value, str) and value != UNCONFIGURED_VERSION:
            raise ServiceError(409, "UNSUPPORTED_VERSION", f"{key} tidak tersedia pada service ini.")

    try:
        validate_payload(schema_name, payload)
    except PayloadValidationError:
        raise
    return payload


@app.get("/openapi.json", include_in_schema=False)
async def shared_openapi_contract(request: Request) -> dict[str, Any]:
    document = copy.deepcopy(OPENAPI_DOCUMENT)
    document["servers"] = [{"url": "/", "description": "Origin yang sedang membuka dokumentasi"}]
    return document


@app.get("/docs", include_in_schema=False)
async def swagger_docs() -> HTMLResponse:
    return get_swagger_ui_html(openapi_url="/openapi.json", title="Carin AI Service API")


@app.get("/internal/v1/capabilities")
async def get_capabilities(_settings: Settings = Depends(require_service_key)) -> JSONResponse:
    result = capabilities()
    validate_payload("CapabilityManifest", result)
    return JSONResponse(result)


@app.get("/internal/v1/catalog")
async def get_catalog(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    query = request.query_params
    version = query.get("version")
    if version is None:
        raise ServiceError(422, "INVALID_INPUT", "Parameter version wajib diisi.", details={"field": "version"})
    raw_limit = query.get("limit", "100")
    try:
        limit = int(raw_limit)
    except ValueError as exc:
        raise ServiceError(422, "INVALID_INPUT", "Parameter limit harus berupa integer.", details={"field": "limit"}) from exc
    if not 1 <= limit <= 200:
        raise ServiceError(422, "INVALID_INPUT", "Parameter limit harus antara 1 dan 200.", details={"field": "limit"})
    if len(query.get("cursor", "")) > 500:
        raise ServiceError(422, "INVALID_INPUT", "Parameter cursor terlalu panjang.", details={"field": "cursor"})
    result = catalog_page(version, query.get("cursor"), limit)
    validate_payload("CatalogPage", result)
    return JSONResponse(result)


@app.post("/internal/v1/analyses")
async def analyze_photo(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    payload = await _json_body(request, "PhotoAnalysisRequest")
    normalized = await fetch_and_normalize(payload["image"], settings)
    provider = getattr(request.app.state, "vlm_client_factory", VLMClient)
    observation = await provider(settings).observe(normalized.data, normalized.mime_type)
    result = photo_result(payload["operationId"], payload["profile"]["profileVersion"], observation)
    validate_payload("AnalysisResult", result)
    return JSONResponse(result)


@app.post("/internal/v1/recalculations")
async def recalculate(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    payload = await _json_body(request, "RecalculationRequest")
    result = recalculation_result(payload)
    validate_payload("AnalysisResult", result)
    return JSONResponse(result)

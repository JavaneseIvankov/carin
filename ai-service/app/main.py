from __future__ import annotations

import copy
import asyncio
import hmac
import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html
from starlette.requests import ClientDisconnect

from .config import Settings, load_settings
from .catalog import catalog_page, load_catalog_bundle
from .contract import OPENAPI_DOCUMENT, validate_payload
from .errors import ContractViolation, PayloadValidationError, ServiceError
from .media import fetch_and_normalize
from .provider import A1V1_FLASH_MODEL, A1V1_MAX_MODEL, A1V1VLMClient, VLMClient
from .security import MemoryRateLimiter, enforce_rate, rate_limiter
from .service import (
    apply_visual_estimates,
    capabilities,
    photo_result,
    recalculation_result,
    visual_estimation_failure,
)


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
logger = logging.getLogger("carin.ai_service")


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = load_settings()
    application.state.rate_limiter = MemoryRateLimiter()
    try:
        yield
    finally:
        del application.state.rate_limiter


app = FastAPI(title="Carin Internal AI Service", version="2.0.0", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    request.state.request_id = str(uuid.uuid4())
    try:
        try:
            settings = load_settings()
        except (ValueError, TypeError):
            raise ServiceError(503, "SERVICE_UNAVAILABLE", "Konfigurasi AI service tidak valid.") from None
        request.state.settings = settings
        try:
            request.state.catalog_bundle = load_catalog_bundle(settings.ai_catalog_mode)
        except (ValueError, KeyError, TypeError):
            raise ServiceError(503, "SERVICE_UNAVAILABLE", "Artifact katalog AI tidak valid.") from None
        if request.headers.get("content-encoding", "identity").lower() != "identity":
            raise ServiceError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Encoding tidak didukung.")
        length = request.headers.get("content-length")
        if length is not None:
            try:
                size = int(length)
            except ValueError:
                raise ServiceError(400, "INVALID_INPUT", "Content-Length tidak valid.") from None
            if size < 0:
                raise ServiceError(400, "INVALID_INPUT", "Content-Length tidak valid.")
            if size > settings.request_max_bytes:
                raise ServiceError(413, "PAYLOAD_TOO_LARGE", "Body request melebihi batas.")
        response = await call_next(request)
    except ServiceError as exc:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after is not None else None
        response = JSONResponse(status_code=exc.status_code, content=_error_body(request, exc), headers=headers)
    except Exception:
        logger.error("unhandled service error requestId=%s", request.state.request_id)
        error = ServiceError(500, "SERVICE_UNAVAILABLE", "Terjadi kesalahan internal.")
        response = JSONResponse(status_code=500, content=_error_body(request, error))
    response.headers["X-Request-Id"] = request.state.request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
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
    error = ServiceError(422, "INVALID_INPUT", "JSON tidak sesuai kontrak Carin AI 2.0.0.", details={"field": exc.field_path})
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
    settings = request.state.settings
    if not settings.service_key:
        raise ServiceError(503, "SERVICE_UNAVAILABLE", "AI_SERVICE_KEY belum dikonfigurasi.")
    supplied = request.headers.get("X-Carin-Service-Key", "")
    if not supplied or not hmac.compare_digest(supplied.encode("utf-8"), settings.service_key.encode("utf-8")):
        raise ServiceError(401, "INVALID_SERVICE_KEY", "Service key tidak valid.")
    await enforce_rate(rate_limiter(request), settings.api_rate_limit, 60)
    return settings


async def _json_body(request: Request, schema_name: str) -> dict[str, Any]:
    media_type = request.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise ServiceError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type harus application/json.")

    try:
        raw = bytearray()
        async with asyncio.timeout(5):
            async for chunk in request.stream():
                if len(raw) + len(chunk) > request.state.settings.request_max_bytes:
                    raise ServiceError(413, "PAYLOAD_TOO_LARGE", "Body request melebihi batas.")
                raw.extend(chunk)
        payload = json.loads(raw, parse_constant=_reject_json_constant)
    except TimeoutError as exc:
        raise ServiceError(408, "REQUEST_TIMEOUT", "Waktu pembacaan body request habis.", retryable=True) from exc
    except (ValueError, UnicodeError, ClientDisconnect) as exc:
        raise ServiceError(400, "INVALID_INPUT", "Body harus berupa JSON yang valid.") from exc
    if not isinstance(payload, dict):
        raise ServiceError(422, "INVALID_INPUT", "Body harus berupa object JSON.")

    # Contract version mismatches are conflicts; malformed field types remain 422.
    if isinstance(payload.get("contractVersion"), str) and payload["contractVersion"] != "2.0.0":
        raise ServiceError(409, "UNSUPPORTED_VERSION", "contractVersion tidak didukung.")
    bundle = request.state.catalog_bundle
    catalog_version = payload.get("catalogVersion")
    if isinstance(catalog_version, str) and catalog_version != bundle.manifest["catalogVersion"]:
        raise ServiceError(409, "CATALOG_VERSION_UNAVAILABLE", "catalogVersion tidak tersedia pada service ini.")
    rule_set_version = payload.get("ruleSetVersion")
    if isinstance(rule_set_version, str) and rule_set_version != bundle.manifest["ruleSetVersion"]:
        raise ServiceError(409, "UNSUPPORTED_VERSION", "ruleSetVersion tidak tersedia pada service ini.")

    try:
        validate_payload(schema_name, payload)
    except PayloadValidationError:
        raise
    return payload


def _reject_json_constant(value: str) -> None:
    raise ValueError("Non-finite JSON numbers are unsupported")


def _validate_response(schema_name: str, payload: Any) -> None:
    try:
        validate_payload(schema_name, payload)
    except PayloadValidationError as exc:
        raise ContractViolation("Response does not match the shared contract") from exc


@app.get("/openapi.json", include_in_schema=False)
async def shared_openapi_contract(request: Request) -> dict[str, Any]:
    document = copy.deepcopy(OPENAPI_DOCUMENT)
    document["servers"] = [{"url": "/", "description": "Origin yang sedang membuka dokumentasi"}]
    return document


@app.get("/docs", include_in_schema=False)
async def swagger_docs() -> HTMLResponse:
    return get_swagger_ui_html(openapi_url="/openapi.json", title="Carin AI Service API")


@app.get("/internal/v1/capabilities")
async def get_capabilities(request: Request, _settings: Settings = Depends(require_service_key)) -> JSONResponse:
    result = capabilities(request.state.catalog_bundle)
    _validate_response("CapabilityManifest", result)
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
    result = catalog_page(request.state.catalog_bundle, version, query.get("cursor"), limit)
    _validate_response("CatalogPage", result)
    return JSONResponse(result)


@app.post("/internal/v1/analyses")
async def analyze_photo(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    payload = await _json_body(request, "PhotoAnalysisRequest")
    normalized = await fetch_and_normalize(payload["image"], settings)
    provider = getattr(request.app.state, "vlm_client_factory", VLMClient)
    provider_client = provider(settings)
    observation = await provider_client.observe(normalized.data, normalized.mime_type)
    result = photo_result(
        payload["operationId"], payload["profile"]["profileVersion"], observation, request.state.catalog_bundle
    )
    unmatched = [component for component in result["components"] if component["catalogFoodId"] is None]
    if observation.is_food and unmatched:
        try:
            estimate = getattr(provider_client, "estimate_component_nutrients", None)
            if not callable(estimate):
                raise ServiceError(503, "MODEL_FAILURE", "Estimasi gizi visual tidak tersedia.", retryable=True)
            estimates = await estimate(
                normalized.data,
                normalized.mime_type,
                [{
                    "id": component["id"],
                    "displayName": component["displayName"],
                    "estimatedMassGrams": component["portion"]["grams"],
                } for component in unmatched],
            )
            apply_visual_estimates(result, estimates)
        except ServiceError as exc:
            logger.warning(
                "visual nutrition estimate unavailable requestId=%s code=%s status=%s",
                request.state.request_id,
                exc.code,
                exc.status_code,
            )
            visual_estimation_failure(result, [component["id"] for component in unmatched])
        except (ValueError, TypeError) as exc:
            logger.warning(
                "visual nutrition estimate invalid requestId=%s errorType=%s",
                request.state.request_id,
                type(exc).__name__,
            )
            visual_estimation_failure(result, [component["id"] for component in unmatched])
    _validate_response("AnalysisResult", result)
    return JSONResponse(result)


async def _analyze_a1v1(request: Request, settings: Settings, model: str) -> JSONResponse:
    payload = await _json_body(request, "A1V1PhotoRequest")
    normalized = await fetch_and_normalize(payload["image"], settings)
    provider = getattr(request.app.state, "a1v1_client_factory", A1V1VLMClient)
    prediction = await provider(settings).analyze(normalized.data, normalized.mime_type, model)
    _validate_response("A1V1Prediction", prediction)
    return JSONResponse(prediction, headers={"X-Carin-Variant": "A1V1"})


@app.post("/internal/ai-service/a-model")
async def analyze_a1v1_variant_a(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    return await _analyze_a1v1(request, settings, A1V1_MAX_MODEL)


@app.post("/internal/ai-service/b-model")
async def analyze_a1v1_variant_b(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    return await _analyze_a1v1(request, settings, A1V1_FLASH_MODEL)


@app.post("/internal/v1/recalculations")
async def recalculate(request: Request, settings: Settings = Depends(require_service_key)) -> JSONResponse:
    payload = await _json_body(request, "RecalculationRequest")
    result = recalculation_result(payload)
    _validate_response("AnalysisResult", result)
    return JSONResponse(result)

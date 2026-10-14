from __future__ import annotations

import hashlib
import json
import io
from uuid import uuid4

import httpx
import pytest
from PIL import Image

from app import main
from app.contract import validate_payload
from app.errors import ServiceError
from app.media import NormalizedImage, _normalize_image, fetch_and_normalize, validate_download_url
from app.provider import FoodObservation, VLMClient
from app.config import Settings


SERVICE_KEY = "test-service-key"
HEADERS = {"X-Carin-Service-Key": SERVICE_KEY}


def profile() -> dict:
    return {
        "profileVersion": 4,
        "ageYears": 45,
        "heightCm": 165,
        "weightKg": 63,
        "sexForReference": "female",
        "diagnosisState": "reported",
        "conditionIds": ["diabetes"],
        "unsupportedConditionLabels": [],
        "allergyState": "unknown",
        "allergies": [],
        "activity": "light",
        "smoking": "never",
    }


def photo_request() -> dict:
    return {
        "contractVersion": "1.0.0",
        "operationId": str(uuid4()),
        "catalogVersion": "unconfigured",
        "ruleSetVersion": "unconfigured",
        "profile": profile(),
        "image": {
            "downloadUrl": "http://minio:9000/private/meal.jpg?signature=test",
            "mimeType": "image/jpeg",
            "sha256": "a" * 64,
        },
    }


def recalc_request() -> dict:
    return {
        "contractVersion": "1.0.0",
        "operationId": str(uuid4()),
        "inputKind": "manual",
        "catalogVersion": "unconfigured",
        "ruleSetVersion": "unconfigured",
        "profile": profile(),
        "components": [
            {
                "id": str(uuid4()),
                "displayName": "nasi putih",
                "catalogFoodId": None,
                "preparation": "matang",
                "portion": {"kind": "known", "quantity": 150, "unit": "g"},
            }
        ],
    }


@pytest.fixture(autouse=True)
def service_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_SERVICE_KEY", SERVICE_KEY)
    monkeypatch.setenv("DASHSCOPE_API_KEY", "unit-test-provider-key")
    monkeypatch.setenv("VLM_BASE_URL", "https://workspace.example/compatible-mode/v1")
    monkeypatch.setenv("VLM_MODEL", "qwen3.7-flash-2026-07-15")
    monkeypatch.setenv("VLM_FALLBACK_MODEL", "qwen3.7-flash")
    monkeypatch.setenv("MEDIA_ALLOWED_HOSTS", "minio:9000")
    main.app.state.vlm_client_factory = VLMClient
    yield
    if hasattr(main.app.state, "vlm_client_factory"):
        del main.app.state.vlm_client_factory


@pytest.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as test_client:
        yield test_client


async def test_capabilities_and_catalog_follow_shared_contract(client):
    response = await client.get("/internal/v1/capabilities", headers=HEADERS)
    assert response.status_code == 200
    validate_payload("CapabilityManifest", response.json())
    assert response.json()["supportedPhotoFoodIds"] == []
    assert response.json()["nutrients"] == []
    assert response.json()["catalogVersion"] == "unconfigured"

    page = await client.get("/internal/v1/catalog", params={"version": "unconfigured", "limit": 50}, headers=HEADERS)
    assert page.status_code == 200
    validate_payload("CatalogPage", page.json())
    assert page.json() == {"catalogVersion": "unconfigured", "items": [], "nextCursor": None}


async def test_catalog_unknown_version_is_contract_error(client):
    response = await client.get("/internal/v1/catalog", params={"version": "old-catalog"}, headers=HEADERS)
    assert response.status_code == 404
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "CATALOG_VERSION_UNAVAILABLE"


async def test_service_key_is_required(client):
    response = await client.get("/internal/v1/capabilities")
    assert response.status_code == 401
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "INVALID_SERVICE_KEY"


async def test_invalid_request_uses_shared_error_envelope(client):
    response = await client.post("/internal/v1/analyses", headers=HEADERS, json={"unexpected": True})
    assert response.status_code == 422
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "INVALID_INPUT"


async def test_unsupported_contract_version_is_409(client):
    body = photo_request()
    body["contractVersion"] = "2.0.0"
    response = await client.post("/internal/v1/analyses", headers=HEADERS, json=body)
    assert response.status_code == 409
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "UNSUPPORTED_VERSION"


async def test_recalculation_preserves_portion_but_never_invents_nutrients(client):
    response = await client.post("/internal/v1/recalculations", headers=HEADERS, json=recalc_request())
    assert response.status_code == 200
    result = response.json()
    validate_payload("AnalysisResult", result)
    assert result["inputKind"] == "manual"
    assert result["supportStatus"] == "partial"
    assert result["components"][0]["portion"]["grams"] == 150
    assert result["components"][0]["matchStatus"] == "unmatched"
    assert set(result["totals"].values()) == {None}
    assert result["sources"] == []
    assert result["dataMode"] == "real"


async def test_recalculation_rejects_food_id_without_matching_catalog(client):
    body = recalc_request()
    body["components"][0]["catalogFoodId"] = "food-from-another-version"
    response = await client.post("/internal/v1/recalculations", headers=HEADERS, json=body)
    assert response.status_code == 409
    validate_payload("Error", response.json())


@pytest.mark.asyncio
async def test_analysis_invokes_vlm_and_returns_contract_result(client, monkeypatch: pytest.MonkeyPatch):
    body = photo_request()

    async def fake_fetch(image, settings):
        return NormalizedImage(b"normalized-photo")

    class FakeVLM:
        async def observe(self, data, mime_type):
            assert data == b"normalized-photo"
            assert mime_type == "image/jpeg"
            return FoodObservation.model_validate(
                {"isFood": True, "components": [{"displayName": "nasi goreng", "preparation": "digoreng", "estimatedMassGrams": 250}]}
            )

    monkeypatch.setattr(main, "fetch_and_normalize", fake_fetch)
    main.app.state.vlm_client_factory = lambda settings: FakeVLM()
    response = await client.post("/internal/v1/analyses", headers=HEADERS, json=body)
    assert response.status_code == 200
    result = response.json()
    validate_payload("AnalysisResult", result)
    assert result["supportStatus"] == "unrecognized"
    assert result["components"][0]["displayName"] == "nasi goreng"
    assert result["components"][0]["portion"]["grams"] == 250
    assert result["components"][0]["nutrients"]["energyKcal"] is None
    assert result["overallAttention"] == "insufficient_information"
    assert result["profileVersion"] == 4
    assert result["operationId"] == body["operationId"]


@pytest.mark.asyncio
async def test_vlm_fallback_receives_only_image_and_fixed_food_prompt():
    requests: list[dict] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        if body["model"] == "qwen3.7-flash-2026-07-15":
            return httpx.Response(404, json={"error": "model snapshot unavailable"})
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"isFood":true,"components":[{"displayName":"nasi","preparation":null,"estimatedMassGrams":120}]}'} }]},
        )

    settings = Settings(
        service_key="service-key",
        vlm_api_key="provider-key",
        vlm_base_url="https://workspace.example/compatible-mode/v1",
        vlm_model="qwen3.7-flash-2026-07-15",
        vlm_fallback_model="qwen3.7-flash",
        vlm_timeout_seconds=5,
        media_allowed_hosts=frozenset({"minio:9000"}),
        media_max_bytes=10 * 1024 * 1024,
    )
    result = await VLMClient(settings, transport=httpx.MockTransport(handler)).observe(b"fake-jpeg", "image/jpeg")
    assert result.is_food is True
    assert [item["model"] for item in requests] == ["qwen3.7-flash-2026-07-15", "qwen3.7-flash"]
    for body in requests:
        assert "profile" not in body
        serialized = json.dumps(body).lower()
        assert "energykcal" not in serialized
        assert "carbohydrateg" not in serialized
        assert body["messages"][1]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_media_allowlist_rejects_external_hosts_and_credentials():
    allowed = frozenset({"minio:9000"})
    with pytest.raises(ServiceError):
        validate_download_url("http://127.0.0.1:9000/private.jpg", allowed)
    with pytest.raises(ServiceError):
        validate_download_url("http://user@minio:9000/private.jpg", allowed)


def test_normalization_resizes_and_outputs_jpeg():
    source = Image.new("RGB", (2000, 1000), "orange")
    buffer = __import__("io").BytesIO()
    source.save(buffer, format="PNG")
    output = _normalize_image(buffer.getvalue(), "image/png")
    with Image.open(__import__("io").BytesIO(output)) as normalized:
        assert normalized.format == "JPEG"
        assert normalized.size == (1600, 800)
        assert not normalized.getexif()


@pytest.mark.asyncio
async def test_signed_media_redirect_is_rejected_before_following():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"Location": "http://169.254.169.254/latest/meta-data/"})

    settings = Settings(
        service_key="key",
        vlm_api_key="",
        vlm_base_url="",
        vlm_model="",
        vlm_fallback_model=None,
        vlm_timeout_seconds=5,
        media_allowed_hosts=frozenset({"minio:9000"}),
        media_max_bytes=1024 * 1024,
    )
    image = {"downloadUrl": "http://minio:9000/image.jpg?sig=signed", "mimeType": "image/jpeg", "sha256": "a" * 64}
    with pytest.raises(ServiceError, match="Redirect URL foto ditolak"):
        await fetch_and_normalize(image, settings, transport=httpx.MockTransport(handler))
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_signed_media_hash_mismatch_is_rejected():
    buffer = io.BytesIO()
    Image.new("RGB", (16, 16), "red").save(buffer, format="JPEG")
    source = buffer.getvalue()

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=source)

    settings = Settings(
        service_key="key",
        vlm_api_key="",
        vlm_base_url="",
        vlm_model="",
        vlm_fallback_model=None,
        vlm_timeout_seconds=5,
        media_allowed_hosts=frozenset({"minio:9000"}),
        media_max_bytes=1024 * 1024,
    )
    image = {"downloadUrl": "http://minio:9000/image.jpg?sig=signed", "mimeType": "image/jpeg", "sha256": "a" * 64}
    assert hashlib.sha256(source).hexdigest() != image["sha256"]
    with pytest.raises(ServiceError, match="SHA-256 foto tidak cocok"):
        await fetch_and_normalize(image, settings, transport=httpx.MockTransport(handler))


async def test_shared_contract_is_exposed_without_a_second_contract_copy(client):
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    assert "/internal/v1/analyses" in spec["paths"]
    assert spec["components"]["securitySchemes"]["ServiceKey"]["name"] == "X-Carin-Service-Key"

from __future__ import annotations

import hashlib
import json
import io
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from PIL import Image

from app import main
from app.contract import validate_payload
from app.errors import ServiceError
from app.media import NormalizedImage, _normalize_image, fetch_and_normalize, validate_download_url
from app.provider import (
    A1V1_FLASH_MODEL,
    A1V1_MAX_MODEL,
    A1V1_PROMPT,
    A1V1_RESPONSE_SCHEMA,
    A1V1VLMClient,
    FoodObservation,
    VLMClient,
    a1v1_response_format,
)
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


def a1v1_result() -> dict:
    return {
        "is_food": True,
        "container_diameter_cm": 20,
        "apparent_volume_cm3": 250,
        "weight_g": 180,
        "components": [{"name": "nasi goreng", "mass_g": 180}],
        "prediction": {"energy_kcal": 320, "protein_g": 8, "carbohydrate_g": 45, "fat_g": 11},
        "limitations": ["Minyak tidak terlihat langsung."],
    }


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


async def test_synthetic_demo_capabilities_and_catalog_follow_shared_contract(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("AI_CATALOG_MODE", "synthetic-demo")

    capabilities_response = await client.get("/internal/v1/capabilities", headers=HEADERS)
    assert capabilities_response.status_code == 200
    validate_payload("CapabilityManifest", capabilities_response.json())
    manifest = capabilities_response.json()
    assert manifest["catalogVersion"] == "synthetic-live-catalog-1"
    assert manifest["nutritionDatasetVersion"] == "synthetic-live-nutrition-1"
    assert manifest["ruleSetVersion"] == "synthetic-live-rules-1"
    assert manifest["dataMode"] == "synthetic"
    assert manifest["conditions"] == []
    assert manifest["supportedRules"] == []

    page = await client.get(
        "/internal/v1/catalog",
        params={"version": "synthetic-live-catalog-1", "limit": 1},
        headers=HEADERS,
    )
    assert page.status_code == 200
    validate_payload("CatalogPage", page.json())
    assert page.json()["catalogVersion"] == "synthetic-live-catalog-1"
    assert len(page.json()["items"]) == 1
    assert page.json()["nextCursor"] is not None

    next_page = await client.get(
        "/internal/v1/catalog",
        params={"version": "synthetic-live-catalog-1", "cursor": page.json()["nextCursor"], "limit": 1},
        headers=HEADERS,
    )
    assert next_page.status_code == 200
    assert len(next_page.json()["items"]) == 1
    assert next_page.json()["nextCursor"] is None


async def test_synthetic_demo_mode_is_rejected_outside_dev_and_test(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("AI_CATALOG_MODE", "synthetic-demo")

    with pytest.raises(ValueError, match="synthetic demo catalog is development-only"):
        main.load_settings()


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


async def test_analysis_with_unavailable_catalog_version_is_409(client, monkeypatch: pytest.MonkeyPatch):
    body = photo_request()
    body["catalogVersion"] = "synthetic-catalog-1"

    async def fail_if_media_is_fetched(*_args, **_kwargs):
        raise AssertionError("media must not be fetched for an unavailable catalog version")

    monkeypatch.setattr(main, "fetch_and_normalize", fail_if_media_is_fetched)
    response = await client.post("/internal/v1/analyses", headers=HEADERS, json=body)

    assert response.status_code == 409
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "CATALOG_VERSION_UNAVAILABLE"
    assert response.json()["error"]["retryable"] is False


async def test_photo_analysis_matches_synthetic_alias_and_computes_nutrients(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("AI_CATALOG_MODE", "synthetic-demo")
    body = photo_request()
    body["catalogVersion"] = "synthetic-live-catalog-1"
    body["ruleSetVersion"] = "synthetic-live-rules-1"

    async def fake_fetch(image, settings):
        return NormalizedImage(b"normalized-photo")

    class FakeVLM:
        async def observe(self, data, mime_type):
            assert data == b"normalized-photo"
            assert mime_type == "image/jpeg"
            return FoodObservation.model_validate({
                "isFood": True,
                "components": [{"displayName": "Nasi Putih!", "estimatedMassGrams": 150}],
            })

    monkeypatch.setattr(main, "fetch_and_normalize", fake_fetch)
    main.app.state.vlm_client_factory = lambda settings: FakeVLM()

    response = await client.post("/internal/v1/analyses", headers=HEADERS, json=body)

    assert response.status_code == 200
    validate_payload("AnalysisResult", response.json())
    result = response.json()
    assert result["dataMode"] == "synthetic"
    assert result["supportStatus"] == "complete"
    assert result["components"][0]["catalogFoodId"] == "demo-rice-001"
    assert result["components"][0]["matchStatus"] == "matched"
    assert result["components"][0]["portion"]["grams"] == 150
    assert result["components"][0]["nutrients"]["energyKcal"] == 225
    assert result["totals"]["energyKcal"] == 225
    assert result["limitations"][0]["code"] == "SYNTHETIC_DATA"
    assert result["attentions"] == []


async def test_photo_analysis_keeps_unmatched_food_unrecognized(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("AI_CATALOG_MODE", "synthetic-demo")
    body = photo_request()
    body["catalogVersion"] = "synthetic-live-catalog-1"
    body["ruleSetVersion"] = "synthetic-live-rules-1"

    async def fake_fetch(image, settings):
        return NormalizedImage(b"normalized-photo")

    class FakeVLM:
        async def observe(self, data, mime_type):
            return FoodObservation.model_validate({
                "isFood": True,
                "components": [{"displayName": "Makanan tidak dikenal", "estimatedMassGrams": 150}],
            })

    monkeypatch.setattr(main, "fetch_and_normalize", fake_fetch)
    main.app.state.vlm_client_factory = lambda settings: FakeVLM()

    response = await client.post("/internal/v1/analyses", headers=HEADERS, json=body)

    assert response.status_code == 200
    result = response.json()
    assert result["supportStatus"] == "unrecognized"
    assert result["components"][0]["catalogFoodId"] is None
    assert result["components"][0]["nutrients"]["energyKcal"] is None
    assert result["totals"]["energyKcal"] is None
    assert result["limitations"][0]["code"] == "SYNTHETIC_DATA"


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


@pytest.mark.parametrize(
    ("route", "model"),
    [
        ("/internal/ai-service/a-model", A1V1_MAX_MODEL),
        ("/internal/ai-service/b-model", A1V1_FLASH_MODEL),
    ],
)
async def test_a1v1_experiment_routes_pin_model_and_return_strict_result(client, monkeypatch, route, model):
    body = {"image": photo_request()["image"]}

    async def fake_fetch(image, settings):
        return NormalizedImage(b"normalized-photo")

    class FakeA1V1:
        async def analyze(self, data, mime_type, requested_model):
            assert data == b"normalized-photo"
            assert mime_type == "image/jpeg"
            assert requested_model == model
            return a1v1_result()

    monkeypatch.setattr(main, "fetch_and_normalize", fake_fetch)
    main.app.state.a1v1_client_factory = lambda settings: FakeA1V1()
    response = await client.post(route, headers=HEADERS, json=body)

    assert response.status_code == 200
    validate_payload("A1V1Prediction", response.json())
    assert response.json() == a1v1_result()
    assert "X-Carin-Model" not in response.headers
    assert response.headers["X-Carin-Variant"] == "A1V1"
    del main.app.state.a1v1_client_factory


async def test_openapi_uses_neutral_a1v1_routes_without_model_names(client):
    response = await client.get("/openapi.json")
    paths = response.json()["paths"]
    assert "/internal/ai-service/a-model" in paths
    assert "/internal/ai-service/b-model" in paths
    assert "/internal/v1/experiments/a1v1/variant-a" not in paths
    assert "/internal/v1/experiments/a1v1/variant-b" not in paths
    for route in ("/internal/ai-service/a-model", "/internal/ai-service/b-model"):
        assert "qwen" not in json.dumps(paths[route]).casefold()


@pytest.mark.asyncio
async def test_a1v1_provider_uses_strict_schema_and_never_falls_back():
    requests: list[dict] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        requests.append(payload)
        return httpx.Response(
            200,
            json={
                "model": A1V1_MAX_MODEL,
                "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(a1v1_result())}}],
            },
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
    result = await A1V1VLMClient(settings, transport=httpx.MockTransport(handler)).analyze(
        b"fake-jpeg", "image/jpeg", A1V1_MAX_MODEL
    )

    assert result == a1v1_result()
    assert len(requests) == 1
    payload = requests[0]
    assert payload["model"] == A1V1_MAX_MODEL
    assert payload["temperature"] == 0
    assert payload["enable_thinking"] is False
    assert payload["max_tokens"] == 1024
    assert payload["response_format"] == a1v1_response_format()
    assert payload["messages"][0]["content"][1]["text"] == A1V1_PROMPT
    assert payload["messages"][0]["content"][0]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert "profile" not in payload
    assert payload["messages"][0]["role"] == "user"


def test_a1v1_prompt_and_schema_match_the_locked_benchmark():
    root = Path(__file__).resolve().parents[2]
    prompt = (root / "experiments/model-evaluation/prompts/food-a1v1-v2.txt").read_text(encoding="utf-8")
    schema = json.loads((root / "experiments/model-evaluation/prompts/food-a1v1-v2.schema.json").read_text(encoding="utf-8"))
    assert A1V1_PROMPT.strip() == prompt.strip()
    assert A1V1_RESPONSE_SCHEMA == schema


@pytest.mark.asyncio
async def test_a1v1_provider_rejects_negative_estimates_without_retry():
    requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        prediction = a1v1_result()
        prediction["weight_g"] = -1
        return httpx.Response(
            200,
            json={
                "model": A1V1_FLASH_MODEL,
                "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(prediction)}}],
            },
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
    with pytest.raises(ServiceError, match="format A1V1"):
        await A1V1VLMClient(settings, transport=httpx.MockTransport(handler)).analyze(
            b"fake-jpeg", "image/jpeg", A1V1_FLASH_MODEL
        )
    assert requests == 1


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
    assert spec["servers"][0]["url"] == "/"


async def test_recalculation_with_duplicate_ids_keeps_components_and_unique_limitations(client):
    body = recalc_request()
    second = dict(body["components"][0], displayName="ayam")
    body["components"].append(second)
    validate_payload("RecalculationRequest", body)
    response = await client.post("/internal/v1/recalculations", headers=HEADERS, json=body)
    assert response.status_code == 200
    result = response.json()
    validate_payload("AnalysisResult", result)
    assert len(result["components"]) == 2
    assert [item["displayName"] for item in result["components"]] == ["nasi putih", "ayam"]
    assert result["coverage"]["energyKcal"]["totalComponentCount"] == 2
    for limitation in result["limitations"]:
        assert len(limitation["componentIds"]) == len(set(limitation["componentIds"]))


async def test_analysis_normalizes_empty_preparation(client, monkeypatch):
    async def fake_fetch(image, settings):
        return NormalizedImage(b"normalized-photo")

    class FakeVLM:
        async def observe(self, data, mime_type):
            return FoodObservation.model_validate({
                "isFood": True,
                "components": [{"displayName": "nasi", "preparation": "", "estimatedMassGrams": 120}],
            })

    monkeypatch.setattr(main, "fetch_and_normalize", fake_fetch)
    main.app.state.vlm_client_factory = lambda settings: FakeVLM()
    response = await client.post("/internal/v1/analyses", headers=HEADERS, json=photo_request())
    assert response.status_code == 200
    validate_payload("AnalysisResult", response.json())
    assert response.json()["components"][0]["preparation"] is None


@pytest.mark.parametrize("path", ["analyses", "recalculations"])
@pytest.mark.parametrize("content_type", [None, "text/plain", "application/vnd.carin+json"])
async def test_post_rejects_unsupported_media_type(client, path, content_type):
    body = photo_request() if path == "analyses" else recalc_request()
    headers = dict(HEADERS)
    if content_type is not None:
        headers["Content-Type"] = content_type
    response = await client.post(f"/internal/v1/{path}", headers=headers, content=json.dumps(body))
    assert response.status_code == 415
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert response.headers["X-Request-Id"] == response.json()["error"]["requestId"]


async def test_json_content_type_with_charset_is_accepted(client):
    response = await client.post(
        "/internal/v1/recalculations",
        headers={**HEADERS, "Content-Type": "application/json; charset=utf-8"},
        content=json.dumps(recalc_request()),
    )
    assert response.status_code == 200
    validate_payload("AnalysisResult", response.json())


@pytest.mark.parametrize("path,schema", [
    ("capabilities", "CapabilityManifest"),
    ("catalog?version=unconfigured", "CatalogPage"),
    ("analyses", "AnalysisResult"),
    ("recalculations", "AnalysisResult"),
])
async def test_invalid_service_response_is_not_reported_as_invalid_input(client, monkeypatch, path, schema):
    real_validate = main.validate_payload

    def reject_response(name, payload):
        real_validate(name, {} if name == schema else payload)

    monkeypatch.setattr(main, "validate_payload", reject_response)
    if path == "analyses":
        async def fake_fetch(image, settings):
            return NormalizedImage(b"normalized-photo")

        class FakeVLM:
            async def observe(self, data, mime_type):
                return FoodObservation.model_validate({"isFood": False, "components": []})

        monkeypatch.setattr(main, "fetch_and_normalize", fake_fetch)
        main.app.state.vlm_client_factory = lambda settings: FakeVLM()
        response = await client.post(f"/internal/v1/{path}", headers=HEADERS, json=photo_request())
    elif path == "recalculations":
        response = await client.post(f"/internal/v1/{path}", headers=HEADERS, json=recalc_request())
    else:
        response = await client.get(f"/internal/v1/{path}", headers=HEADERS)
    assert response.status_code == 500
    validate_payload("Error", response.json())
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert response.headers["X-Request-Id"] == response.json()["error"]["requestId"]

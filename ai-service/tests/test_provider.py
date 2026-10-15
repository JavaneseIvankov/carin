from __future__ import annotations

import json

import httpx
import pytest

from app.config import load_settings
from app.errors import ServiceError
from app.provider import VLMClient


def provider_response(estimates: list[dict], model: str = "qwen3.7-flash-2026-07-15") -> httpx.Response:
    return httpx.Response(200, json={
        "model": model,
        "choices": [{
            "finish_reason": "stop",
            "message": {"content": json.dumps({"estimates": estimates})},
        }],
    })


@pytest.mark.asyncio
async def test_estimates_only_requested_components_with_per_portion_nutrients():
    requested = [{"id": "component-a", "displayName": "Nasi goreng", "estimatedMassGrams": 180}]
    response = {
        "componentId": "component-a",
        "nutrients": {
            "energyKcal": 320,
            "carbohydrateG": 42,
            "proteinG": 9,
            "fatG": 12,
            "fiberG": None,
            "sugarsG": None,
            "sodiumMg": None,
        },
    }
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return provider_response([response])

    client = VLMClient(load_settings(), transport=httpx.MockTransport(handler))
    actual = await client.estimate_component_nutrients(b"image", "image/jpeg", requested)

    assert actual == {"component-a": response["nutrients"]}
    payload = json.loads(requests[0].content)
    assert payload["response_format"]["json_schema"]["strict"] is True
    assert "max_tokens" not in payload
    user_text = "".join(part.get("text", "") for part in payload["messages"][-1]["content"])
    assert "component-a" in user_text
    assert "Nasi goreng" in user_text
    assert "320" not in user_text
    assert "per 100 g" in payload["messages"][0]["content"]


@pytest.mark.asyncio
@pytest.mark.parametrize("estimates", [
    [],
    [{"componentId": "unexpected", "nutrients": {}}],
    [
        {"componentId": "component-a", "nutrients": {}},
        {"componentId": "component-a", "nutrients": {}},
    ],
    [{"componentId": "component-a", "nutrients": {
        "energyKcal": -1,
        "carbohydrateG": None,
        "proteinG": None,
        "fatG": None,
        "fiberG": None,
        "sugarsG": None,
        "sodiumMg": None,
    }}],
])
async def test_rejects_estimates_with_missing_extra_duplicate_or_invalid_values(estimates):
    client = VLMClient(load_settings(), transport=httpx.MockTransport(lambda _request: provider_response(estimates)))

    with pytest.raises(ServiceError) as error:
        await client.estimate_component_nutrients(
            b"image", "image/jpeg", [{"id": "component-a", "displayName": "Nasi goreng", "estimatedMassGrams": None}]
        )

    assert error.value.code == "MODEL_FAILURE"
    assert error.value.retryable is False


@pytest.mark.asyncio
async def test_provider_timeout_is_a_retryable_model_failure():
    def timeout(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("provider timeout")

    client = VLMClient(load_settings(), transport=httpx.MockTransport(timeout))

    with pytest.raises(ServiceError) as error:
        await client.estimate_component_nutrients(
            b"image", "image/jpeg", [{"id": "component-a", "displayName": "Nasi goreng", "estimatedMassGrams": None}]
        )

    assert error.value.code == "MODEL_FAILURE"
    assert error.value.retryable is True

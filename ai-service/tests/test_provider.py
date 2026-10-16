from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import replace

import httpx
import pytest

from app.config import load_settings
from app.errors import ServiceError
from app.provider import VLMClient


def meal_observation() -> dict:
    return {
        "isFood": True, "containerDiameterCm": 22, "apparentVolumeCm3": 220,
        "components": [{
            "displayName": "nasi goreng", "preparation": "digoreng", "estimatedMassGrams": 180,
            "estimatedNutrients": {
                "energyKcal": 320, "carbohydrateG": 42, "proteinG": 9, "fatG": 12,
                "fiberG": 2, "sugarsG": 3, "sodiumMg": 650,
            },
        }],
    }


def observation_response(body: dict, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(200, json={"choices": [{
        "finish_reason": finish_reason,
        "message": {"content": json.dumps(body)},
    }]})


async def test_observation_requests_all_seven_nutrients_in_one_structured_call():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return observation_response(meal_observation())

    client = VLMClient(load_settings(), transport=httpx.MockTransport(handler))
    observation = await client.observe(b"image", "image/jpeg")
    assert observation.components[0].estimated_nutrients.sodium_mg == 650
    assert observation.components[0].estimated_nutrients.sugars_g == 3
    assert len(requests) == 1
    request = requests[0]
    assert request["temperature"] == 0
    assert request["enable_thinking"] is False
    assert request["response_format"]["json_schema"]["strict"] is True
    assert request["max_tokens"] == 4096
    assert "profile" not in request
    schema = request["response_format"]["json_schema"]["schema"]
    assert len(schema["properties"]["components"]["items"]["properties"]["estimatedNutrients"]["required"]) == 7


@pytest.mark.parametrize("case", [
    "missing", "null", "negative", "string", "infinite", "nan", "blank_name", "zero_mass",
    "extra", "nonfood_components", "nonfood_geometry", "empty_food", "truncated",
])
async def test_observation_rejects_invalid_or_incomplete_estimates(case):
    body = deepcopy(meal_observation())
    nutrients = body["components"][0]["estimatedNutrients"]
    if case == "missing":
        del nutrients["sodiumMg"]
    elif case in {"null", "negative", "string", "infinite", "nan"}:
        nutrients["sodiumMg"] = {
            "null": None, "negative": -1, "string": "650", "infinite": float("inf"), "nan": float("nan"),
        }[case]
    elif case == "blank_name":
        body["components"][0]["displayName"] = "   "
    elif case == "zero_mass":
        body["components"][0]["estimatedMassGrams"] = 0
    elif case == "extra":
        body["medicalAdvice"] = "safe"
    elif case == "nonfood_components":
        body["isFood"] = False
    elif case == "nonfood_geometry":
        body["isFood"] = False
        body["components"] = []
    elif case == "empty_food":
        body["components"] = []
    client = VLMClient(
        replace(load_settings(), vlm_fallback_model=None),
        transport=httpx.MockTransport(lambda _request: observation_response(body, "length" if case == "truncated" else "stop")),
    )
    with pytest.raises(ServiceError) as error:
        await client.observe(b"image", "image/jpeg")
    assert error.value.code == "MODEL_FAILURE"


async def test_nonfood_observation_has_no_invented_nutrients():
    body = {"isFood": False, "containerDiameterCm": None, "apparentVolumeCm3": None, "components": []}
    client = VLMClient(load_settings(), transport=httpx.MockTransport(lambda _request: observation_response(body)))
    observation = await client.observe(b"image", "image/jpeg")
    assert observation.is_food is False
    assert observation.components == []


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
    assert payload["max_tokens"] == 4096
    assert payload["enable_thinking"] is False
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

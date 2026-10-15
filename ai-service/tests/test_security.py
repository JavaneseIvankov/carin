from __future__ import annotations

import struct
import zlib

import pytest

from app import main
from app.contract import validate_payload
from app.errors import ServiceError
from app.media import NormalizedImage, _normalize_image
from app.security import MemoryRateLimiter
from test_api import HEADERS, a1v1_result, photo_request


A = "/internal/ai-service/a-model"
B = "/internal/ai-service/b-model"


@pytest.fixture
def fake_analysis(monkeypatch):
    calls = []

    async def fetch(image, settings):
        calls.append("fetch")
        return NormalizedImage(b"photo")

    class Provider:
        async def analyze(self, data, mime_type, model):
            calls.append("provider")
            return a1v1_result()

    monkeypatch.setattr(main, "fetch_and_normalize", fetch)
    main.app.state.a1v1_client_factory = lambda settings: Provider()
    return calls


async def post(client, path=A):
    return await client.post(path, headers=HEADERS, json={"image": photo_request()["image"]})


async def test_api_rate_limit_is_shared_and_blocks_work(client, monkeypatch, fake_analysis):
    monkeypatch.setenv("API_RATE_LIMIT_PER_MINUTE", "2")
    assert (await post(client, A)).status_code == 200
    assert (await post(client, B)).status_code == 200

    response = await post(client, "/internal/v1/analyses")
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    validate_payload("Error", response.json())
    assert fake_analysis == ["fetch", "provider"] * 2


async def test_invalid_service_key_does_not_consume_authenticated_quota(client, monkeypatch, fake_analysis):
    monkeypatch.setenv("API_RATE_LIMIT_PER_MINUTE", "1")
    assert (await client.post(A, json={"image": photo_request()["image"]})).status_code == 401
    assert (await client.post(A, headers={"X-Carin-Service-Key": "wrong"}, json={"image": photo_request()["image"]})).status_code == 401
    assert (await post(client)).status_code == 200
    limited = await post(client, B)
    assert limited.status_code == 429
    assert fake_analysis == ["fetch", "provider"]


async def test_oversized_body_is_rejected_before_media_or_provider(client, fake_analysis):
    response = await client.post(A, headers={**HEADERS, "Content-Type": "application/json"}, content=b"x" * 65537)
    assert response.status_code == 413
    validate_payload("Error", response.json())
    assert fake_analysis == []


async def test_unsupported_encoding_and_nonfinite_json_are_rejected(client, fake_analysis):
    compressed = await client.post(A, headers={**HEADERS, "Content-Encoding": "gzip"}, content=b"x")
    assert compressed.status_code == 415
    nonfinite = await client.post(A, headers={**HEADERS, "Content-Type": "application/json"}, content='{"image":NaN}')
    assert nonfinite.status_code == 400
    assert nonfinite.headers["Cache-Control"] == "no-store"
    assert nonfinite.headers["X-Content-Type-Options"] == "nosniff"
    assert fake_analysis == []


async def test_memory_rate_window_expires():
    now = [0.0]
    limiter = MemoryRateLimiter(clock=lambda: now[0])
    assert await limiter.hit(1, 60) == 0
    assert await limiter.hit(1, 60) == 60
    now[0] = 61
    assert await limiter.hit(1, 60) == 0


def test_large_image_header_is_rejected_before_decoding_pixel_data():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", 5000, 4000, 8, 2, 0, 0, 0)
    image = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", b"") + chunk(b"IEND", b"")
    with pytest.raises(ServiceError, match="Dimensi foto"):
        _normalize_image(image, "image/png")

from __future__ import annotations

import httpx
import pytest

from app import main
from app.provider import VLMClient
from app.security import MemoryRateLimiter


@pytest.fixture(autouse=True)
def service_environment(monkeypatch: pytest.MonkeyPatch):
    values = {
        "AI_SERVICE_KEY": "test-service-key",
        "DASHSCOPE_API_KEY": "unit-test-provider-key",
        "VLM_BASE_URL": "https://workspace.example/compatible-mode/v1",
        "VLM_MODEL": "qwen3.7-flash-2026-07-15", "VLM_FALLBACK_MODEL": "qwen3.7-flash",
        "MEDIA_ALLOWED_HOSTS": "minio:9000", "REQUEST_MAX_BYTES": "65536",
        "API_RATE_LIMIT_PER_MINUTE": "5",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    main.app.state.vlm_client_factory = VLMClient
    main.app.state.rate_limiter = MemoryRateLimiter()
    yield
    for name in ("vlm_client_factory", "a1v1_client_factory", "rate_limiter"):
        if hasattr(main.app.state, name):
            delattr(main.app.state, name)


@pytest.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as test_client:
        yield test_client

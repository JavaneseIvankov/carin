from pathlib import Path

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPOSITORY_ROOT / "infra" / "compose.yaml"


def test_worker_uses_private_healthy_real_ai_service_without_provider_key():
    compose = yaml.safe_load(COMPOSE_FILE.read_text(encoding="utf-8"))
    services = compose["services"]
    worker = services["worker"]
    ai_service = services["ai-service"]

    assert worker["depends_on"]["ai-service"]["condition"] == "service_healthy"
    assert worker["environment"]["AI_SERVICE_URL"] == "${AI_SERVICE_URL:-http://ai-service:8000}"
    assert worker["environment"]["AI_SERVICE_KEY"] == "${AI_SERVICE_KEY:-local-placeholder-change-before-use}"
    assert worker["environment"]["AI_MODE"] == "${AI_MODE:-fixture}"
    assert "DASHSCOPE_API_KEY" not in worker["environment"]

    assert ai_service["profiles"] == ["worker"]
    assert ai_service["networks"] == ["private"]
    assert "ports" not in ai_service
    assert "DASHSCOPE_API_KEY" in ai_service["environment"]
    assert ai_service["environment"]["APP_ENV"] == "dev"
    assert ai_service["environment"]["AI_CATALOG_MODE"] == "${AI_CATALOG_MODE:-unconfigured}"
    assert ai_service["environment"]["MEDIA_ALLOWED_HOSTS"] == "minio:9000"
    assert ai_service["healthcheck"]["test"]

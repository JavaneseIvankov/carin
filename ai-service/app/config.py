from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    service_key: str
    vlm_api_key: str
    vlm_base_url: str
    vlm_model: str
    vlm_fallback_model: str | None
    vlm_timeout_seconds: float
    media_allowed_hosts: frozenset[str]
    media_max_bytes: int


def _allowed_hosts(raw: str) -> frozenset[str]:
    return frozenset(item.strip().casefold().rstrip(".") for item in raw.split(",") if item.strip())


def load_settings() -> Settings:
    timeout = float(os.getenv("VLM_TIMEOUT_SECONDS", "35"))
    max_bytes = int(os.getenv("MEDIA_MAX_BYTES", str(10 * 1024 * 1024)))
    if not 1 <= timeout <= 80:
        raise ValueError("VLM_TIMEOUT_SECONDS must be between 1 and 80")
    if not 1024 <= max_bytes <= 10 * 1024 * 1024:
        raise ValueError("MEDIA_MAX_BYTES must be between 1 KiB and 10 MiB")

    base_url = os.getenv("VLM_BASE_URL", "").strip().rstrip("/")
    if base_url:
        parsed = urlsplit(base_url)
        local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
        if (parsed.scheme != "https" and not local_http) or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("VLM_BASE_URL must be an HTTPS OpenAI-compatible base URL")
        if parsed.query or parsed.fragment or not parsed.path.endswith("/v1"):
            raise ValueError("VLM_BASE_URL must end in /v1 and have no query or fragment")

    return Settings(
        service_key=os.getenv("AI_SERVICE_KEY", ""),
        vlm_api_key=os.getenv("DASHSCOPE_API_KEY", ""),
        vlm_base_url=base_url,
        vlm_model=os.getenv("VLM_MODEL", "qwen3.7-flash-2026-07-15").strip(),
        vlm_fallback_model=os.getenv("VLM_FALLBACK_MODEL", "qwen3.7-flash").strip() or None,
        vlm_timeout_seconds=timeout,
        media_allowed_hosts=_allowed_hosts(os.getenv("MEDIA_ALLOWED_HOSTS", "")),
        media_max_bytes=max_bytes,
    )

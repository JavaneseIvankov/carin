from __future__ import annotations

import hashlib
import asyncio
import io
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings
from .errors import ServiceError


MAX_SIDE = 1600
# Bound decoded memory before loading; ordinary 12 MP phone photos fit this CPU-VPS budget.
MAX_PIXELS = 16_000_000


@dataclass(frozen=True)
class NormalizedImage:
    data: bytes
    mime_type: str = "image/jpeg"


def validate_download_url(url: str, allowed_hosts: frozenset[str]) -> None:
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").casefold().rstrip(".")
        port = parsed.port
    except ValueError as exc:
        raise ServiceError(422, "INVALID_INPUT", "URL foto tidak valid.") from exc

    netloc = host if port is None else f"{host}:{port}"
    if (
        parsed.scheme not in {"http", "https"}
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or netloc not in allowed_hosts
    ):
        raise ServiceError(422, "INVALID_INPUT", "URL foto harus berasal dari host MinIO yang diizinkan.")


async def _read_limited(response: httpx.Response, max_bytes: int) -> bytes:
    declared = response.headers.get("content-length")
    if declared:
        try:
            if int(declared) > max_bytes:
                raise ServiceError(422, "INVALID_INPUT", "Ukuran foto melebihi batas 10 MiB.")
        except ValueError:
            raise ServiceError(422, "INVALID_INPUT", "Header ukuran foto tidak valid.")

    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > max_bytes:
            raise ServiceError(422, "INVALID_INPUT", "Ukuran foto melebihi batas 10 MiB.")
        chunks.append(chunk)
    if total == 0:
        raise ServiceError(422, "INVALID_INPUT", "Foto kosong.")
    return b"".join(chunks)


def _normalize_image(data: bytes, mime_type: str) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as image:
            actual_mime = Image.MIME.get(image.format or "")
            if actual_mime != mime_type:
                raise ServiceError(422, "INVALID_INPUT", "Format foto tidak sesuai dengan mimeType.")
            width, height = image.size
            if width < 1 or height < 1 or width * height > MAX_PIXELS:
                raise ServiceError(422, "INVALID_INPUT", "Dimensi foto tidak dapat diproses.")
            image.load()
            image = ImageOps.exif_transpose(image)
            if image.mode in {"RGBA", "LA"}:
                rgba = image.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=90, optimize=True)
            return output.getvalue()
    except ServiceError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ServiceError(422, "INVALID_INPUT", "File bukan foto JPEG/PNG yang dapat dibaca.") from exc


async def fetch_and_normalize(
    image: dict[str, str], settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> NormalizedImage:
    if not settings.media_allowed_hosts:
        raise ServiceError(503, "SERVICE_UNAVAILABLE", "Allowlist host MinIO belum dikonfigurasi.", retryable=False)
    validate_download_url(image["downloadUrl"], settings.media_allowed_hosts)

    try:
        timeout = httpx.Timeout(connect=5, read=15, write=5, pool=5)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False, transport=transport) as client:
            async with client.stream("GET", image["downloadUrl"], headers={"Accept": image["mimeType"]}) as response:
                if 300 <= response.status_code < 400:
                    raise ServiceError(422, "INVALID_INPUT", "Redirect URL foto ditolak.")
                if response.status_code >= 500:
                    raise ServiceError(503, "SERVICE_UNAVAILABLE", "Penyimpanan foto sementara tidak tersedia.", retryable=True)
                if response.status_code != 200:
                    raise ServiceError(422, "INVALID_INPUT", "Foto tidak dapat diambil dari URL bertanda tangan.")
                response_mime = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if response_mime != image["mimeType"]:
                    raise ServiceError(422, "INVALID_INPUT", "Content-Type foto tidak sesuai dengan mimeType.")
                original = await _read_limited(response, settings.media_max_bytes)
    except ServiceError:
        raise
    except httpx.TimeoutException as exc:
        raise ServiceError(503, "SERVICE_UNAVAILABLE", "Waktu pengambilan foto habis.", retryable=True) from exc
    except httpx.RequestError as exc:
        raise ServiceError(503, "SERVICE_UNAVAILABLE", "Foto tidak dapat diambil dari penyimpanan.", retryable=True) from exc

    if hashlib.sha256(original).hexdigest() != image["sha256"]:
        raise ServiceError(422, "INVALID_INPUT", "SHA-256 foto tidak cocok.")
    normalized = await asyncio.to_thread(_normalize_image, original, image["mimeType"])
    return NormalizedImage(normalized)

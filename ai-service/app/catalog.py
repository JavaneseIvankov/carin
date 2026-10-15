from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from .contract import validate_payload
from .errors import ServiceError


UNCONFIGURED_VERSION = "unconfigured"
SYNTHETIC_DEMO_MODE = "synthetic-demo"


@dataclass(frozen=True)
class CatalogBundle:
    manifest: dict[str, Any]
    items: tuple[dict[str, Any], ...]


def _unconfigured_bundle() -> CatalogBundle:
    return CatalogBundle(
        manifest={
            "contractVersion": "2.0.0",
            "catalogVersion": UNCONFIGURED_VERSION,
            "nutritionDatasetVersion": UNCONFIGURED_VERSION,
            "ruleSetVersion": UNCONFIGURED_VERSION,
            "conditions": [],
            "supportedPhotoFoodIds": [],
            "supportedRules": [],
            "nutrients": [],
            "dataMode": "real",
            "publishedAt": "2026-10-15T00:00:00Z",
        },
        items=(),
    )


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("synthetic demo catalog bundle is unavailable or invalid") from exc
    if not isinstance(value, dict):
        raise ValueError("synthetic demo catalog bundle must contain JSON objects")
    return value


@lru_cache(maxsize=2)
def load_catalog_bundle(mode: str) -> CatalogBundle:
    if mode == "unconfigured":
        return _unconfigured_bundle()
    if mode != SYNTHETIC_DEMO_MODE:
        raise ValueError("AI_CATALOG_MODE is not supported")

    data_dir = Path(__file__).resolve().parents[1] / "data" / "synthetic-demo"
    manifest = _read_json(data_dir / "capabilities.json")
    page = _read_json(data_dir / "catalog.json")
    validate_payload("CapabilityManifest", manifest)
    validate_payload("CatalogPage", page)
    if (
        manifest["dataMode"] != "synthetic"
        or manifest["conditions"]
        or manifest.get("supportedRules", [])
        or page["catalogVersion"] != manifest["catalogVersion"]
        or page["nextCursor"] is not None
    ):
        raise ValueError("synthetic demo catalog bundle has inconsistent versions or unsupported rules")

    food_ids: set[str] = set()
    supported_ids = set(manifest["supportedPhotoFoodIds"])
    sources_by_id: dict[str, dict[str, Any]] = {}
    for food in page["items"]:
        if food["id"] in food_ids or food["catalogVersion"] != manifest["catalogVersion"]:
            raise ValueError("synthetic demo catalog contains duplicate IDs or a mismatched version")
        food_ids.add(food["id"])
        for source in food["sources"]:
            if source["kind"] != "synthetic" or source["datasetVersion"] != manifest["nutritionDatasetVersion"]:
                raise ValueError("synthetic demo catalog sources must be labeled and versioned synthetic data")
            prior = sources_by_id.get(source["id"])
            if prior is not None and prior != source:
                raise ValueError("synthetic demo catalog has conflicting source records")
            sources_by_id[source["id"]] = source
    if supported_ids != food_ids:
        raise ValueError("synthetic demo photo support must match the catalog food IDs")
    return CatalogBundle(manifest=manifest, items=tuple(page["items"]))


def catalog_page(bundle: CatalogBundle, version: str, cursor: str | None, limit: int) -> dict[str, Any]:
    if len(version) < 1 or len(version) > 500:
        raise ServiceError(422, "INVALID_INPUT", "Parameter version tidak valid.")
    if cursor is not None and (not cursor or len(cursor) > 500 or not cursor.isdecimal()):
        raise ServiceError(422, "INVALID_INPUT", "Parameter cursor tidak valid.")
    if version != bundle.manifest["catalogVersion"]:
        raise ServiceError(404, "CATALOG_VERSION_UNAVAILABLE", "Versi katalog tidak tersedia.")
    start = int(cursor) if cursor else 0
    items = bundle.items[start:start + limit]
    end = start + len(items)
    next_cursor = str(end) if end < len(bundle.items) else None
    return {"catalogVersion": version, "items": list(items), "nextCursor": next_cursor}

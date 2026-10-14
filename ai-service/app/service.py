from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .errors import ServiceError
from .provider import FoodObservation


UNCONFIGURED_VERSION = "unconfigured"
CONTRACT_VERSION = "1.0.0"
NUTRIENT_FIELDS = (
    "energyKcal",
    "carbohydrateG",
    "proteinG",
    "fatG",
    "fiberG",
    "sugarsG",
    "sodiumMg",
)


def _empty_nutrients() -> dict[str, None]:
    return {field: None for field in NUTRIENT_FIELDS}


def _coverage(component_count: int) -> dict[str, dict[str, int]]:
    return {field: {"knownComponentCount": 0, "totalComponentCount": component_count} for field in NUTRIENT_FIELDS}


def _versions_match(payload: dict[str, Any]) -> None:
    if isinstance(payload.get("contractVersion"), str) and payload["contractVersion"] != CONTRACT_VERSION:
        raise ServiceError(409, "UNSUPPORTED_VERSION", "contractVersion tidak didukung.")
    for key in ("catalogVersion", "ruleSetVersion"):
        value = payload.get(key)
        if isinstance(value, str) and value != UNCONFIGURED_VERSION:
            raise ServiceError(409, "UNSUPPORTED_VERSION", f"{key} tidak tersedia pada service ini.")


def capabilities() -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "catalogVersion": UNCONFIGURED_VERSION,
        "nutritionDatasetVersion": UNCONFIGURED_VERSION,
        "ruleSetVersion": UNCONFIGURED_VERSION,
        "conditions": [],
        "supportedPhotoFoodIds": [],
        "nutrients": [],
        "dataMode": "real",
        "publishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def catalog_page(version: str, cursor: str | None, limit: int) -> dict[str, Any]:
    if len(version) < 1 or len(version) > 500:
        raise ServiceError(422, "INVALID_INPUT", "Parameter version tidak valid.")
    if cursor is not None and (not cursor or len(cursor) > 500):
        raise ServiceError(422, "INVALID_INPUT", "Parameter cursor tidak valid.")
    if version != UNCONFIGURED_VERSION:
        raise ServiceError(404, "CATALOG_VERSION_UNAVAILABLE", "Versi katalog tidak tersedia.")
    # T31 has not supplied approved catalog artifacts; this immutable bootstrap page is empty.
    return {"catalogVersion": UNCONFIGURED_VERSION, "items": [], "nextCursor": None}


def photo_result(operation_id: str, profile_version: int, observation: FoodObservation) -> dict[str, Any]:
    components = observation.components
    if not observation.is_food:
        components = []

    results: list[dict[str, Any]] = []
    for proposal in components:
        component_id = str(uuid4())
        grams = proposal.estimated_mass_grams
        results.append(
            {
                "id": component_id,
                "displayName": proposal.display_name,
                "catalogFoodId": None,
                "preparation": proposal.preparation or None,
                "matchStatus": "unrecognized",
                "portion": {
                    "quantity": grams,
                    "unit": "g" if grams is not None else None,
                    "servingId": None,
                    "grams": grams,
                    "origin": "photo_estimate",
                    "basis": "Estimasi visual VLM; belum dicocokkan atau dikalibrasi dengan artifact porsi terverifikasi." if grams is not None else None,
                    "sourceId": None,
                },
                "nutrients": _empty_nutrients(),
                "per100g": _empty_nutrients(),
                "nutrientSourceIds": _empty_nutrients(),
                "sourceIds": [],
            }
        )

    limitations: list[dict[str, Any]] = [
        {
            "code": "NUTRITION_ARTIFACT_UNAVAILABLE",
            "message": "Katalog dan sumber gizi T31 belum dipasang; service tidak menghitung atau menebak nilai gizi.",
            "componentIds": [item["id"] for item in results],
            "critical": True,
        },
        {
            "code": "RULE_ARTIFACT_UNAVAILABLE",
            "message": "Rule kesehatan bersumber belum dipasang; tidak ada penilaian personal yang dijalankan.",
            "componentIds": [],
            "critical": True,
        },
        {
            "code": "ALLERGEN_UNVERIFIED",
            "message": "Foto tidak dapat memastikan seluruh bahan atau ketiadaan alergen.",
            "componentIds": [item["id"] for item in results],
            "critical": True,
        },
    ]
    if not results:
        placeholder_id = str(uuid4())
        results.append(
            {
                "id": placeholder_id,
                "displayName": "Makanan belum dikenali",
                "catalogFoodId": None,
                "preparation": None,
                "matchStatus": "unrecognized",
                "portion": {
                    "quantity": None,
                    "unit": None,
                    "servingId": None,
                    "grams": None,
                    "origin": "photo_estimate",
                    "basis": None,
                    "sourceId": None,
                },
                "nutrients": _empty_nutrients(),
                "per100g": _empty_nutrients(),
                "nutrientSourceIds": _empty_nutrients(),
                "sourceIds": [],
            }
        )
        limitations.append(
            {
                "code": "UNRECOGNIZED_COMPONENT",
                "message": "Model tidak mengenali makanan yang dapat dipadankan.",
                "componentIds": [placeholder_id],
                "critical": True,
            }
        )
    elif results:
        limitations.append(
            {
                "code": "UNRECOGNIZED_COMPONENT",
                "message": "Model mengusulkan nama makanan, tetapi belum ada katalog terverifikasi untuk memadankannya.",
                "componentIds": [item["id"] for item in results],
                "critical": True,
            }
        )

    return {
        "contractVersion": CONTRACT_VERSION,
        "operationId": operation_id,
        "inputKind": "photo",
        "supportStatus": "unrecognized",
        "overallAttention": "insufficient_information",
        "profileVersion": profile_version,
        "catalogVersion": UNCONFIGURED_VERSION,
        "nutritionDatasetVersion": UNCONFIGURED_VERSION,
        "ruleSetVersion": UNCONFIGURED_VERSION,
        "computedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "components": results,
        "totals": _empty_nutrients(),
        "coverage": _coverage(len(results)),
        "attentions": [],
        "limitations": limitations,
        "sources": [],
        "dataMode": "real",
    }


def recalculation_result(payload: dict[str, Any]) -> dict[str, Any]:
    inputs = payload["components"]
    if any(item["catalogFoodId"] is not None for item in inputs):
        raise ServiceError(409, "CATALOG_VERSION_UNAVAILABLE", "catalogFoodId tidak dapat dipadankan tanpa artifact katalog yang sesuai.")

    components: list[dict[str, Any]] = []
    for item in inputs:
        portion = item["portion"]
        known = portion["kind"] == "known"
        unit = portion.get("unit") if known else None
        quantity = portion.get("quantity") if known else None
        components.append(
            {
                "id": item["id"],
                "displayName": item["displayName"],
                "catalogFoodId": None,
                "preparation": item["preparation"],
                "matchStatus": "unmatched",
                "portion": {
                    "quantity": quantity,
                    "unit": unit,
                    "servingId": portion.get("servingId") if known and unit == "serving" else None,
                    "grams": quantity if known and unit == "g" else None,
                    "origin": "user_reported",
                    "basis": None,
                    "sourceId": None,
                },
                "nutrients": _empty_nutrients(),
                "per100g": _empty_nutrients(),
                "nutrientSourceIds": _empty_nutrients(),
                "sourceIds": [],
            }
        )

    ids = list(dict.fromkeys(item["id"] for item in components))
    return {
        "contractVersion": CONTRACT_VERSION,
        "operationId": payload["operationId"],
        "inputKind": payload["inputKind"],
        "supportStatus": "partial",
        "overallAttention": "insufficient_information",
        "profileVersion": payload["profile"]["profileVersion"],
        "catalogVersion": UNCONFIGURED_VERSION,
        "nutritionDatasetVersion": UNCONFIGURED_VERSION,
        "ruleSetVersion": UNCONFIGURED_VERSION,
        "computedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "components": components,
        "totals": _empty_nutrients(),
        "coverage": _coverage(len(components)),
        "attentions": [],
        "limitations": [
            {
                "code": "NUTRITION_ARTIFACT_UNAVAILABLE",
                "message": "Komponen dan porsi dipertahankan, tetapi katalog/sumber gizi T31 belum tersedia untuk perhitungan.",
                "componentIds": ids,
                "critical": True,
            },
            {
                "code": "RULE_ARTIFACT_UNAVAILABLE",
                "message": "Rule kesehatan bersumber belum dipasang; tidak ada penilaian personal yang dijalankan.",
                "componentIds": [],
                "critical": True,
            },
            {
                "code": "ALLERGEN_UNVERIFIED",
                "message": "Data komponen tidak memverifikasi ada atau tidaknya alergen.",
                "componentIds": ids,
                "critical": True,
            },
        ],
        "sources": [],
        "dataMode": "real",
    }

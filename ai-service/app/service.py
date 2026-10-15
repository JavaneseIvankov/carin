from __future__ import annotations

from datetime import datetime, timezone
import math
import re
import unicodedata
from typing import Any
from uuid import uuid4

from .catalog import CatalogBundle, UNCONFIGURED_VERSION
from .errors import ServiceError
from .provider import FoodObservation


CONTRACT_VERSION = "2.0.0"
MODEL_ESTIMATE_VERSION = "vlm-estimate-v1"
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


def capabilities(bundle: CatalogBundle) -> dict[str, Any]:
    return dict(bundle.manifest)


def _normalize_food_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(re.findall(r"[\w]+", normalized, flags=re.UNICODE))


def _round_nutrient(value: float) -> float:
    rounded = round(value, 6)
    return 0.0 if rounded == 0 else rounded


def _synthetic_photo_result(
    operation_id: str,
    profile_version: int,
    observation: FoodObservation,
    bundle: CatalogBundle,
) -> dict[str, Any]:
    manifest = bundle.manifest
    foods_by_name: dict[str, dict[str, Any]] = {}
    for food in bundle.items:
        for name in [food["displayName"], *food["aliases"]]:
            normalized = _normalize_food_name(name)
            prior = foods_by_name.get(normalized)
            if prior is not None and prior["id"] != food["id"]:
                raise ServiceError(503, "SERVICE_UNAVAILABLE", "Alias katalog sintetis ambigu.")
            foods_by_name[normalized] = food

    proposals = observation.components if observation.is_food else []
    component_results: list[dict[str, Any]] = []
    referenced_sources: dict[str, dict[str, Any]] = {}
    for proposal in proposals:
        component_id = str(uuid4())
        food = foods_by_name.get(_normalize_food_name(proposal.display_name))
        grams = proposal.estimated_mass_grams
        portion = {
            "quantity": grams,
            "unit": "g" if grams is not None else None,
            "servingId": None,
            "grams": grams,
            "origin": "photo_estimate",
            "basis": "Estimasi visual VLM; angka katalog pada hasil ini sintetis untuk pengujian." if grams is not None else None,
            "sourceId": None,
        }
        if food is None:
            component_results.append({
                "id": component_id,
                "displayName": proposal.display_name,
                "catalogFoodId": None,
                "preparation": proposal.preparation or None,
                "matchStatus": "unrecognized",
                "portion": portion,
                "nutrients": _empty_nutrients(),
                "per100g": _empty_nutrients(),
                "nutrientSourceIds": _empty_nutrients(),
                "sourceIds": [],
            })
            continue

        nutrient_source_ids = food["nutrientSourceIds"]
        source_ids = list(dict.fromkeys(
            source_id for source_id in nutrient_source_ids.values() if source_id is not None
        ))
        sources_by_id = {source["id"]: source for source in food["sources"]}
        for source_id in source_ids:
            referenced_sources[source_id] = sources_by_id[source_id]
        nutrients = {
            field: (
                _round_nutrient(food["per100g"][field] * grams / 100)
                if grams is not None and food["per100g"][field] is not None else None
            )
            for field in NUTRIENT_FIELDS
        }
        component_results.append({
            "id": component_id,
            "displayName": food["displayName"],
            "catalogFoodId": food["id"],
            "preparation": proposal.preparation or food["preparation"],
            "matchStatus": "matched",
            "portion": portion,
            "nutrients": nutrients,
            "per100g": food["per100g"],
            "nutrientSourceIds": nutrient_source_ids,
            "sourceIds": source_ids,
        })

    if not component_results:
        placeholder_id = str(uuid4())
        component_results = [{
            "id": placeholder_id,
            "displayName": "Makanan belum dikenali",
            "catalogFoodId": None,
            "preparation": None,
            "matchStatus": "unrecognized",
            "portion": {
                "quantity": None, "unit": None, "servingId": None, "grams": None,
                "origin": "photo_estimate", "basis": None, "sourceId": None,
            },
            "nutrients": _empty_nutrients(),
            "per100g": _empty_nutrients(),
            "nutrientSourceIds": _empty_nutrients(),
            "sourceIds": [],
        }]

    totals: dict[str, float | None] = {}
    coverage = _coverage(len(component_results))
    for field in NUTRIENT_FIELDS:
        known = [component["nutrients"][field] for component in component_results if component["nutrients"][field] is not None]
        totals[field] = _round_nutrient(sum(known)) if known else None
        coverage[field] = {
            "knownComponentCount": len(known),
            "totalComponentCount": len(component_results),
        }

    all_matched = all(component["matchStatus"] == "matched" for component in component_results)
    core_known = all(
        component["portion"]["grams"] is not None and
        all(component["nutrients"][field] is not None for field in NUTRIENT_FIELDS[:4])
        for component in component_results
    )
    support_status = "unrecognized" if not any(
        component["matchStatus"] == "matched" for component in component_results
    ) else "complete" if all_matched and core_known else "partial"
    limitations = [{
        "code": "SYNTHETIC_DATA",
        "message": "Katalog dan angka gizi sintetis hanya untuk pengujian alur; bukan informasi gizi nyata.",
        "componentIds": [],
        "critical": False,
    }, {
        "code": "RULE_ARTIFACT_UNAVAILABLE",
        "message": "Rule kesehatan belum disediakan; service tidak membuat penilaian personal.",
        "componentIds": [],
        "critical": True,
    }, {
        "code": "ALLERGEN_UNVERIFIED",
        "message": "Foto tidak dapat memastikan seluruh bahan atau ketiadaan alergen.",
        "componentIds": [component["id"] for component in component_results],
        "critical": True,
    }]
    if support_status != "complete":
        limitations.append({
            "code": "UNRECOGNIZED_COMPONENT" if support_status == "unrecognized" or not all_matched else "INCOMPLETE_PORTION",
            "message": "Sebagian hasil foto tidak dapat dipadankan dengan katalog sintetis atau porsinya belum diketahui.",
            "componentIds": [component["id"] for component in component_results if component["matchStatus"] != "matched" or component["portion"]["grams"] is None],
            "critical": True,
        })

    return {
        "contractVersion": CONTRACT_VERSION,
        "operationId": operation_id,
        "inputKind": "photo",
        "supportStatus": support_status,
        "overallAttention": "insufficient_information",
        "profileVersion": profile_version,
        "catalogVersion": manifest["catalogVersion"],
        "nutritionDatasetVersion": manifest["nutritionDatasetVersion"],
        "ruleSetVersion": manifest["ruleSetVersion"],
        "computedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "components": component_results,
        "totals": totals,
        "coverage": coverage,
        "attentions": [],
        "limitations": limitations,
        "sources": list(referenced_sources.values()),
        "dataMode": "synthetic",
    }


def photo_result(
    operation_id: str,
    profile_version: int,
    observation: FoodObservation,
    bundle: CatalogBundle,
) -> dict[str, Any]:
    if bundle.manifest["dataMode"] == "synthetic":
        return _synthetic_photo_result(operation_id, profile_version, observation, bundle)

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


def apply_visual_estimates(
    result: dict[str, Any], estimates: dict[str, dict[str, float | None]],
) -> None:
    targets = [component for component in result["components"] if component["catalogFoodId"] is None]
    target_ids = {component["id"] for component in targets}
    if set(estimates) != target_ids:
        raise ValueError("VLM estimate IDs do not match unmatched photo components")

    validated: dict[str, dict[str, float | None]] = {}
    for component_id, nutrients in estimates.items():
        if set(nutrients) != set(NUTRIENT_FIELDS):
            raise ValueError("VLM nutrient fields do not match the shared nutrient set")
        for value in nutrients.values():
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, (int, float)) or
                not math.isfinite(value) or value < 0
            ):
                raise ValueError("VLM nutrient estimates must be finite and nonnegative")
        validated[component_id] = nutrients

    sources_by_id = {source["id"]: source for source in result["sources"]}
    estimated_component_ids: list[str] = []
    unavailable_component_ids: list[str] = []
    for component in targets:
        component_id = component["id"]
        nutrient_values = validated[component_id]
        known_nutrients = [key for key in NUTRIENT_FIELDS if nutrient_values[key] is not None]
        if not known_nutrients:
            unavailable_component_ids.append(component_id)
            continue

        source_id = f"vlm-estimate-{component_id}"
        source = {
            "id": source_id,
            "kind": "model_estimate",
            "title": "Estimasi visual VLM untuk porsi pada foto",
            "datasetVersion": MODEL_ESTIMATE_VERSION,
            "itemRef": f"{result['operationId']}/{component_id}",
            "url": None,
        }
        existing = sources_by_id.get(source_id)
        if existing is not None and existing != source:
            raise ValueError("VLM estimate source ID conflicts with an existing source")
        sources_by_id[source_id] = source
        component["sourceIds"].append(source_id)
        for key in NUTRIENT_FIELDS:
            value = nutrient_values[key]
            component["nutrients"][key] = value
            component["nutrientSourceIds"][key] = source_id if value is not None else None
        estimated_component_ids.append(component_id)

    result["sources"] = list(sources_by_id.values())
    if estimated_component_ids:
        result["limitations"].append({
            "code": "VLM_NUTRIENT_ESTIMATE",
            "message": "Nilai gizi untuk makanan tanpa match katalog adalah estimasi visual VLM, bukan data terverifikasi.",
            "componentIds": estimated_component_ids,
            "critical": True,
        })
    if unavailable_component_ids:
        result["limitations"].append({
            "code": "VLM_NUTRITION_UNAVAILABLE",
            "message": "VLM tidak dapat memperkirakan zat gizi untuk sebagian komponen; nilainya tetap tidak tersedia.",
            "componentIds": unavailable_component_ids,
            "critical": True,
        })

    totals: dict[str, float | None] = {}
    coverage = _coverage(len(result["components"]))
    for field in NUTRIENT_FIELDS:
        known = [component["nutrients"][field] for component in result["components"] if component["nutrients"][field] is not None]
        totals[field] = _round_nutrient(sum(known)) if known else None
        coverage[field] = {
            "knownComponentCount": len(known),
            "totalComponentCount": len(result["components"]),
        }
    result["totals"] = totals
    result["coverage"] = coverage


def visual_estimation_failure(result: dict[str, Any], component_ids: list[str]) -> None:
    result["limitations"].append({
        "code": "VLM_NUTRITION_UNAVAILABLE",
        "message": "Estimasi gizi visual tidak tersedia; nilai yang tidak diketahui tetap null.",
        "componentIds": component_ids,
        "critical": True,
    })


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

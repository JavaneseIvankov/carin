#!/usr/bin/env python3
"""Validate versioned AI data artifacts and their projections to the shared wire contract.

This checks artifact structure, references, provenance, approval gates, and wire
schemas. It does not approve clinical content or establish model quality.
Dependencies are the repository's existing PyYAML and jsonschema tooling.
"""

import hashlib
import json
import math
from pathlib import Path
import sys
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
import yaml


NUTRIENTS = (
    "energyKcal", "carbohydrateG", "proteinG", "fatG", "fiberG", "sugarsG", "sodiumMg"
)
ARTIFACT_FILES = {
    "catalog": "catalog.json",
    "nutrition-dataset": "nutrition-dataset.json",
    "rules": "rules.json",
    "capability-manifest": "capability-manifest.json",
    "review-metadata": "review-metadata.json",
}


def load_bundle(data_dir):
    return {
        name: json.loads((data_dir / filename).read_text())
        for name, filename in ARTIFACT_FILES.items()
    }


def _wire_schema(contract, name, registry):
    uri = contract.as_uri() + "#/components/schemas/" + name
    return Draft202012Validator({"$ref": uri}, registry=registry,
                                format_checker=FormatChecker())


def _errors_for_schema(validator, instance, label):
    return [f"{label}: {error.message}" for error in validator.iter_errors(instance)]


def _canonical_sha256(value):
    encoded = json.dumps(value, ensure_ascii=False, allow_nan=False,
                         sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _check_approval(errors, label, approval, version, record):
    if approval.get("status") != "approved":
        if approval.get("boundVersion") is not None or approval.get("contentSha256") is not None:
            errors.append(f"{label} draft approval must not retain a version or content binding")
        return
    if approval.get("boundVersion") != version:
        errors.append(f"{label} approval version binding is stale")
    try:
        content_hash = _canonical_sha256(record)
    except ValueError as exc:
        errors.append(f"{label} content hash cannot be computed for non-canonical data: {exc}")
        return
    if approval.get("contentSha256") != content_hash:
        errors.append(f"{label} approval content binding is stale")


def _wire_source(source):
    return {key: source[key] for key in ("id", "kind", "title", "datasetVersion", "itemRef", "url")}


def _wire_food(food, catalog_version, sources):
    linked = {source_id for source_id in food["nutrientSourceIds"].values() if source_id is not None}
    linked.update(serving["sourceId"] for serving in food["servings"])
    return {
        "id": food["id"], "catalogVersion": catalog_version,
        "displayName": food["displayName"], "aliases": food["aliases"],
        "preparation": food["preparation"], "per100g": food["per100g"],
        "servings": food["servings"], "sources": [_wire_source(sources[source_id]) for source_id in sorted(linked)],
        "nutrientSourceIds": food["nutrientSourceIds"],
    }


def validate_bundle(bundle, repo_root):
    """Return all validation errors; an empty list means this bundle is internally valid."""
    missing = sorted(set(ARTIFACT_FILES) - set(bundle))
    if missing:
        return [f"missing artifact bundle entries: {', '.join(missing)}"]
    errors = []
    data_dir = repo_root / "ai-service" / "data"
    schemas_dir = data_dir / "schemas"
    contract = repo_root / "specs" / "contracts" / "ai-service.openapi.yaml"
    document = yaml.safe_load(contract.read_text())
    registry = Registry().with_resources([
        (contract.resolve().as_uri(), Resource.from_contents(
            document, default_specification=DRAFT202012
        ))
    ])
    schema_paths = sorted(schemas_dir.glob("*.schema.json"))
    schema_documents = {path.resolve(): json.loads(path.read_text()) for path in schema_paths}
    schema_registry = Registry().with_resources([
        (path.as_uri(), Resource.from_contents(schema, default_specification=DRAFT202012))
        for path, schema in schema_documents.items()
    ])

    for schema_name, value in (
        ("catalog.schema.json", bundle["catalog"]),
        ("nutrition-dataset.schema.json", bundle["nutrition-dataset"]),
        ("rule-set.schema.json", bundle["rules"]),
        ("capability-manifest.schema.json", bundle["capability-manifest"]),
        ("review-metadata.schema.json", bundle["review-metadata"]),
    ):
        schema = schema_documents[(schemas_dir / schema_name).resolve()]
        schema_validator = Draft202012Validator(schema, registry=schema_registry,
                                                format_checker=FormatChecker())
        errors.extend(_errors_for_schema(schema_validator, value, schema_name))

    # Do not traverse artifacts whose shape has already failed schema validation.
    if errors:
        return errors

    catalog = bundle["catalog"]
    nutrition = bundle["nutrition-dataset"]
    rules = bundle["rules"]
    manifest = bundle["capability-manifest"]
    reviews = bundle["review-metadata"].get("artifacts", {})
    version_checks = (
        ("rules", "catalogVersion", rules.get("catalogVersion"), catalog.get("catalogVersion")),
        ("rules", "nutritionDatasetVersion", rules.get("nutritionDatasetVersion"), nutrition.get("datasetVersion")),
        ("capability-manifest", "catalogVersion", manifest.get("catalogVersion"), catalog.get("catalogVersion")),
        ("capability-manifest", "nutritionDatasetVersion", manifest.get("nutritionDatasetVersion"), nutrition.get("datasetVersion")),
        ("capability-manifest", "ruleSetVersion", manifest.get("ruleSetVersion"), rules.get("ruleSetVersion")),
    )
    for artifact_name, key, actual, expected in version_checks:
        if actual != expected:
            errors.append(f"version mismatch: {artifact_name}.{key}={actual!r}, expected {expected!r}")

    sources = {source.get("id"): source for source in nutrition.get("sources", [])}
    if len(sources) != len(nutrition.get("sources", [])):
        errors.append("duplicate source ID")
    foods = {food.get("id"): food for food in catalog.get("foods", [])}
    if len(foods) != len(catalog.get("foods", [])):
        errors.append("duplicate catalog food ID")
    conditions = {condition.get("id"): condition for condition in rules.get("conditions", [])}
    if len(conditions) != len(rules.get("conditions", [])):
        errors.append("duplicate condition ID")
    rule_ids = set()

    source_roles = {}
    for food in catalog.get("foods", []):
        for source_id in food.get("nutrientSourceIds", {}).values():
            if source_id is not None:
                source_roles.setdefault(source_id, set()).add("nutrition")
        for serving in food.get("servings", []):
            source_roles.setdefault(serving["sourceId"], set()).add("portion")
    for rule in rules.get("rules", []):
        for source_id in rule.get("citationSourceIds", []):
            source_roles.setdefault(source_id, set()).add("health_rule")

    for source_id, source in sources.items():
        roles = source_roles.get(source_id, set())
        if source.get("kind") in ("nutrition", "portion"):
            expected_versions = {nutrition.get("datasetVersion")}
        elif source.get("kind") == "health_rule":
            expected_versions = {rules.get("ruleSetVersion")}
        elif roles:
            expected_versions = {
                rules.get("ruleSetVersion") if role == "health_rule"
                else nutrition.get("datasetVersion") for role in roles
            }
        else:
            # An unreferenced synthetic record is still versioned, but its role
            # cannot be inferred until an artifact uses it.
            expected_versions = {nutrition.get("datasetVersion"), rules.get("ruleSetVersion")}
        if roles and len(expected_versions) > 1:
            errors.append(f"source {source_id} spans roles with different dataset versions; split the source record")
        elif source.get("datasetVersion") not in expected_versions:
            errors.append(f"source {source_id} has wrong dataset version for its role")
        if source.get("synthetic") or source.get("kind") == "synthetic":
            if not urlsplit(str(source.get("url", ""))).hostname or not urlsplit(
                    str(source.get("url", ""))).hostname.endswith(".invalid"):
                errors.append(f"synthetic source {source_id} must use a .invalid URL")
        else:
            parsed_url = urlsplit(str(source.get("url", "")))
            host = (parsed_url.hostname or "").rstrip(".").lower()
            if (parsed_url.scheme.lower() not in ("http", "https") or not host
                    or host == "invalid" or host.endswith(".invalid")):
                errors.append(
                    f"non-synthetic source {source_id} requires an HTTP(S) citation URL "
                    "with a nonempty non-.invalid host"
                )
        if not source.get("license", {}).get("name"):
            errors.append(f"source {source_id} requires license metadata")

    for food in catalog.get("foods", []):
        food_id = food.get("id", "<missing>")
        nutrients = food.get("per100g", {})
        source_ids = food.get("nutrientSourceIds", {})
        for key in NUTRIENTS:
            value = nutrients.get(key)
            source_id = source_ids.get(key)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                      or not math.isfinite(value) or value < 0):
                errors.append(f"food {food_id} per100g.{key} must be finite and non-negative")
            if value is None and source_id is not None:
                errors.append(f"food {food_id} unknown {key} cannot reference a nutrient source")
            if value is not None and source_id not in sources:
                errors.append(f"food {food_id} has unknown source for {key}: {source_id!r}")
            if value is not None and source_id in sources:
                source = sources[source_id]
                if source.get("kind") not in ("nutrition", "synthetic"):
                    errors.append(f"food {food_id} source for {key} is not a nutrition source")
                if source.get("datasetVersion") != nutrition.get("datasetVersion"):
                    errors.append(f"food {food_id} source for {key} has wrong dataset version")
        serving_ids = set()
        for serving in food.get("servings", []):
            serving_id = serving.get("id")
            if serving_id in serving_ids:
                errors.append(f"food {food_id} has duplicate serving ID {serving_id!r}")
            serving_ids.add(serving_id)
            grams = serving.get("grams")
            if isinstance(grams, bool) or not isinstance(grams, (int, float)) or not math.isfinite(grams) or grams <= 0:
                errors.append(f"food {food_id} serving grams must be finite and greater than zero")
            source_id = serving.get("sourceId")
            if source_id not in sources:
                errors.append(f"food {food_id} serving has unknown source: {source_id!r}")
            elif sources[source_id].get("kind") not in ("portion", "synthetic"):
                errors.append(f"food {food_id} serving source must be a portion source")

    for rule in rules.get("rules", []):
        rule_id = rule.get("id", "<missing>")
        if rule_id in rule_ids:
            errors.append(f"duplicate rule ID: {rule_id}")
        rule_ids.add(rule_id)
        if rule.get("version") != rules.get("ruleSetVersion"):
            errors.append(f"version mismatch: rule {rule_id} does not match ruleSetVersion")
        if rule.get("conditionId") not in conditions:
            errors.append(f"rule {rule_id} references unknown condition {rule.get('conditionId')!r}")
        for food_id in rule.get("scope", {}).get("foodIds", []):
            if food_id not in foods:
                errors.append(f"rule {rule_id} references unknown catalog food {food_id!r}")
        for source_id in rule.get("citationSourceIds", []):
            if source_id not in sources:
                errors.append(f"rule {rule_id} references unknown source {source_id!r}")
            elif sources[source_id].get("kind") not in ("health_rule", "synthetic"):
                errors.append(f"rule {rule_id} citation {source_id!r} is not a health_rule source")

    for condition in rules.get("conditions", []):
        for nutrient in condition.get("requiredNutrients", []):
            if nutrient not in NUTRIENTS:
                errors.append(f"condition {condition.get('id')} references unsupported nutrient {nutrient!r}")
        if condition.get("personalizationSupported") and not any(
                rule.get("conditionId") == condition.get("id") for rule in rules.get("rules", [])):
            errors.append(f"condition {condition.get('id')} claims personalization without a rule")
    for food_id in manifest.get("supportedPhotoFoodIds", []):
        if food_id not in foods:
            errors.append(f"manifest references unknown catalog food {food_id!r}")
    if manifest.get("conditions") != rules.get("conditions"):
        errors.append("manifest conditions must match versioned rules conditions")

    published = manifest.get("publicationStatus") == "published"
    if not published and (manifest.get("supportedPhotoFoodIds") or manifest.get("nutrients")
                          or manifest.get("conditions")):
        errors.append("unpublished manifest cannot claim supported foods, nutrients, or conditions")

    artifact_bindings = (
        ("catalog", catalog.get("catalogVersion"), catalog),
        ("nutrition-dataset", nutrition.get("datasetVersion"), nutrition),
        ("rules", rules.get("ruleSetVersion"), rules),
        ("capability-manifest", manifest.get("artifactVersion"), manifest),
    )
    for artifact_name, version, record in artifact_bindings:
        _check_approval(errors, f"{artifact_name} approval", reviews.get(artifact_name, {}), version, record)
    source_approvals = reviews.get("sources", {})
    for source_id, source in sources.items():
        _check_approval(errors, f"source approval {source_id}", source_approvals.get(source_id, {}),
                        source.get("datasetVersion"), source)
    rule_approvals = reviews.get("rulesById", {})
    for rule in rules.get("rules", []):
        _check_approval(errors, f"rule approval {rule.get('id')}", rule_approvals.get(rule.get("id"), {}),
                        rule.get("version"), rule)

    if published:
        if manifest.get("dataMode") != "real":
            errors.append("published manifest must use real dataMode")
        artifact_names = ("catalog", "nutrition-dataset", "rules", "capability-manifest")
        for artifact_name in artifact_names:
            approval = reviews.get(artifact_name, {})
            if (approval.get("status") != "approved" or not approval.get("reviewer")
                    or not approval.get("approvedAt") or not approval.get("approvalId")):
                errors.append(f"publication requires complete approval metadata for {artifact_name}")
        for source_id, source in sources.items():
            if source.get("synthetic") or source.get("kind") == "synthetic":
                errors.append(f"synthetic source {source_id} cannot be promoted to real")
            approval = reviews.get("sources", {}).get(source_id, {})
            if (approval.get("status") != "approved" or not approval.get("reviewer")
                    or not approval.get("approvedAt") or not approval.get("approvalId")):
                errors.append(f"publication requires source approval for {source_id}")
        for rule in rules.get("rules", []):
            approval = reviews.get("rulesById", {}).get(rule.get("id"), {})
            if (approval.get("status") != "approved" or not approval.get("reviewer")
                    or not approval.get("approvedAt") or not approval.get("approvalId")):
                errors.append(f"publication requires rule approval for {rule.get('id')}")
        for food_id in manifest.get("supportedPhotoFoodIds", []):
            food = foods.get(food_id, {})
            for nutrient in NUTRIENTS[:4]:
                if food.get("per100g", {}).get(nutrient) is None:
                    errors.append(f"published photo food {food_id} lacks core nutrient {nutrient}")
        declared_nutrients = set(manifest.get("nutrients", []))
        for food_id in manifest.get("supportedPhotoFoodIds", []):
            food = foods.get(food_id, {})
            for nutrient in declared_nutrients:
                if food.get("per100g", {}).get(nutrient) is None:
                    errors.append(f"published photo food {food_id} lacks declared nutrient {nutrient}")
        if not manifest.get("publishedAt"):
            errors.append("published manifest requires publishedAt")
    elif manifest.get("dataMode") == "real":
        errors.append("real dataMode requires published status and approvals")

    # Validate exactly the public shapes after stripping only the internal publication marker.
    foods_validator = _wire_schema(contract, "CatalogFood", registry)
    for food in catalog.get("foods", []):
        try:
            projection = _wire_food(food, catalog.get("catalogVersion"), sources)
        except KeyError as exc:
            errors.append(f"catalog food {food.get('id')} has an unresolved source: {exc.args[0]}")
            continue
        errors.extend(_errors_for_schema(foods_validator, projection, f"wire CatalogFood {food.get('id')}"))
    manifest_projection = {key: value for key, value in manifest.items()
                           if key not in ("artifactVersion", "publicationStatus")}
    errors.extend(_errors_for_schema(_wire_schema(contract, "CapabilityManifest", registry),
                                     manifest_projection, "wire CapabilityManifest"))
    return errors


def main():
    repo_root = Path(__file__).resolve().parents[1]
    data_dir = Path(__file__).resolve().parent / "data"
    bundle = load_bundle(data_dir)
    errors = validate_bundle(bundle, repo_root)
    if errors:
        print("AI data artifact validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    manifest = bundle["capability-manifest"]
    if manifest["publicationStatus"] == "published":
        print("PASS: published AI capability manifest validates against internal and shared wire schemas.")
    else:
        print("PASS: unpublished AI data templates validate; publication is gated and capability claims are empty.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

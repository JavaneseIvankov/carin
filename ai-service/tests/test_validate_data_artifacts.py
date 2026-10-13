"""Tests for fail-closed AI data artifact validation. All values are synthetic."""

import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "validate_data_artifacts", ROOT / "validate_data_artifacts.py"
)
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

NUTRIENTS = ("energyKcal", "carbohydrateG", "proteinG", "fatG", "fiberG", "sugarsG", "sodiumMg")


def synthetic_source(kind="synthetic", source_id="source.synthetic-test"):
    return {
        "id": source_id,
        "kind": kind,
        "title": "Synthetic test source; not evidence",
        "datasetVersion": ("rules-unpublished-0.1.0" if kind == "health_rule"
                           else "nutrition-unpublished-0.1.0"),
        "itemRef": "test-only synthetic value",
        "url": "https://example.invalid/synthetic-test",
        "license": {"name": "test-only synthetic", "url": None},
        "basis": "Generated only for validator tests",
        "synthetic": True,
    }


def synthetic_food():
    return {
        "id": "food.synthetic-test",
        "displayName": "Synthetic test food",
        "aliases": [],
        "preparation": "synthetic test preparation",
        "per100g": {key: None for key in NUTRIENTS},
        "servings": [],
        "nutrientSourceIds": {key: None for key in NUTRIENTS},
    }


def synthetic_rule():
    return {
        "id": "rule.synthetic-test",
        "version": "rules-unpublished-0.1.0",
        "conditionId": "condition.synthetic-test",
        "requiredProfileFields": [],
        "requiredNutrients": [],
        "scope": {"foodIds": [], "preparation": None, "portionBasis": None},
        "reason": "Synthetic test rule only; not guidance",
        "adjustments": [],
        "criticalMissingFields": [],
        "conflictSet": None,
        "citationSourceIds": ["source.synthetic-test"],
        "limitations": ["test-only synthetic rule"],
        "ruleBody": {"kind": "synthetic_test_only"},
    }


def placeholder_real_source(url):
    return {
        "id": "source.invalid-citation-test",
        "kind": "nutrition",
        "title": "Test placeholder for citation URL validation",
        "datasetVersion": "nutrition-unpublished-0.1.0",
        "itemRef": "test-only placeholder; no nutrition data",
        "url": url,
        "license": {"name": "test-only placeholder", "url": None},
        "basis": "Citation URL validation only",
        "synthetic": False,
    }


def approval_for(record, version):
    content = json.dumps(record, ensure_ascii=False, allow_nan=False,
                         sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "status": "approved", "reviewer": "reviewer.test",
        "approvedAt": "2026-10-13T00:00:00Z", "approvalId": "approval.test",
        "boundVersion": version, "contentSha256": hashlib.sha256(content).hexdigest(),
    }


class ValidateDataArtifactsTests(unittest.TestCase):
    def setUp(self):
        self.bundle = validator.load_bundle(ROOT / "data")

    def test_unpublished_empty_templates_are_valid_and_support_nothing(self):
        report = validator.validate_bundle(self.bundle, ROOT.parent)

        self.assertEqual(report, [])
        self.assertEqual(self.bundle["capability-manifest"]["supportedPhotoFoodIds"], [])
        self.assertEqual(self.bundle["capability-manifest"]["conditions"], [])
        self.assertEqual(self.bundle["capability-manifest"]["dataMode"], "synthetic")
        self.assertEqual(self.bundle["capability-manifest"]["publicationStatus"], "unpublished")

    def test_rejects_manifest_food_reference_missing_from_catalog(self):
        bad = copy.deepcopy(self.bundle)
        bad["capability-manifest"]["supportedPhotoFoodIds"] = ["food.missing"]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("unknown catalog food" in error for error in errors))

    def test_unpublished_manifest_cannot_claim_supported_scope(self):
        bad = copy.deepcopy(self.bundle)
        bad["capability-manifest"]["supportedPhotoFoodIds"] = ["food.candidate"]
        bad["capability-manifest"]["nutrients"] = ["energyKcal"]
        condition = {
            "id": "condition.candidate", "displayName": "Candidate condition",
            "personalizationSupported": False, "requiredProfileFields": [],
            "requiredNutrients": [], "supportedAgeMinimum": None, "supportedAgeMaximum": None,
        }
        bad["rules"]["conditions"] = [condition]
        bad["capability-manifest"]["conditions"] = [copy.deepcopy(condition)]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("unpublished manifest" in error.lower() for error in errors))

    def test_rejects_inconsistent_artifact_versions(self):
        bad = copy.deepcopy(self.bundle)
        bad["nutrition-dataset"]["datasetVersion"] = "nutrition-other"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("version mismatch" in error for error in errors))

    def test_rejects_invalid_numeric_data(self):
        bad = copy.deepcopy(self.bundle)
        bad["catalog"]["foods"] = [synthetic_food()]
        bad["catalog"]["foods"][0]["per100g"]["energyKcal"] = -1

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("per100g" in error or "minimum" in error for error in errors))

    def test_synthetic_food_projection_matches_shared_wire_schema(self):
        staged = copy.deepcopy(self.bundle)
        source = synthetic_source()
        food = synthetic_food()
        food["per100g"]["energyKcal"] = 123.5
        food["nutrientSourceIds"]["energyKcal"] = source["id"]
        staged["nutrition-dataset"]["sources"] = [source]
        staged["catalog"]["foods"] = [food]

        self.assertEqual(validator.validate_bundle(staged, ROOT.parent), [])

    def test_rejects_non_finite_numeric_data(self):
        bad = copy.deepcopy(self.bundle)
        bad["catalog"]["foods"] = [synthetic_food()]
        bad["catalog"]["foods"][0]["per100g"]["energyKcal"] = math.nan

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("per100g" in error or "finite" in error for error in errors))

    def test_approved_catalog_with_nonfinite_values_returns_errors(self):
        for invalid_value in (math.inf, math.nan):
            with self.subTest(value=invalid_value):
                bad = copy.deepcopy(self.bundle)
                food = synthetic_food()
                food["per100g"]["energyKcal"] = 42.0
                bad["catalog"]["foods"] = [food]
                catalog = bad["catalog"]
                bad["review-metadata"]["artifacts"]["catalog"] = approval_for(
                    catalog, catalog["catalogVersion"]
                )
                bad["catalog"]["foods"][0]["per100g"]["energyKcal"] = invalid_value

                errors = validator.validate_bundle(bad, ROOT.parent)

                self.assertTrue(any("finite" in error.lower() for error in errors))
                self.assertTrue(any("approval content" in error.lower() and "hash" in error.lower()
                                    for error in errors))

    def test_rejects_publication_without_complete_approval_metadata(self):
        bad = copy.deepcopy(self.bundle)
        bad["capability-manifest"]["publicationStatus"] = "published"
        bad["capability-manifest"]["dataMode"] = "real"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("approval" in error.lower() for error in errors))

    def test_rejects_synthetic_source_promoted_to_real(self):
        bad = copy.deepcopy(self.bundle)
        bad["nutrition-dataset"]["sources"] = [synthetic_source()]
        bad["capability-manifest"]["publicationStatus"] = "published"
        bad["capability-manifest"]["dataMode"] = "real"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("synthetic" in error.lower() for error in errors))

    def test_rejects_rule_citation_to_unknown_source(self):
        bad = copy.deepcopy(self.bundle)
        bad["rules"]["rules"] = [synthetic_rule()]
        bad["rules"]["rules"][0]["citationSourceIds"] = ["source.missing"]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("unknown source" in error.lower() for error in errors))

    def test_rejects_unversioned_source_even_when_unreferenced(self):
        bad = copy.deepcopy(self.bundle)
        source = synthetic_source(kind="portion")
        source["datasetVersion"] = "wrong-unreferenced-version"
        bad["nutrition-dataset"]["sources"] = [source]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("source.synthetic-test" in error and "dataset version" in error.lower()
                            for error in errors))

    def test_health_rule_source_uses_rule_set_version(self):
        bad = copy.deepcopy(self.bundle)
        source = synthetic_source(kind="health_rule")
        source["datasetVersion"] = "nutrition-unpublished-0.1.0"
        bad["nutrition-dataset"]["sources"] = [source]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("source.synthetic-test" in error and "dataset version" in error.lower()
                            for error in errors))

    def test_approved_published_source_rejects_reserved_or_non_web_urls(self):
        for url in (
            "https://example.invalid/fictional",
            "https://invalid/fictional",
            "urn:foo",
            "https:///missing-host",
        ):
            with self.subTest(url=url):
                bad = copy.deepcopy(self.bundle)
                source = placeholder_real_source(url)
                bad["nutrition-dataset"]["sources"] = [source]
                food = synthetic_food()
                bad["catalog"]["foods"] = [food]
                for index, nutrient in enumerate(NUTRIENTS[:4], start=1):
                    food["per100g"][nutrient] = float(index * 10)
                    food["nutrientSourceIds"][nutrient] = source["id"]
                manifest = bad["capability-manifest"]
                manifest["publicationStatus"] = "published"
                manifest["dataMode"] = "real"
                manifest["supportedPhotoFoodIds"] = [food["id"]]
                manifest["nutrients"] = list(NUTRIENTS[:4])
                artifacts = bad["review-metadata"]["artifacts"]
                for name, record, version in (
                    ("catalog", bad["catalog"], bad["catalog"]["catalogVersion"]),
                    ("nutrition-dataset", bad["nutrition-dataset"], bad["nutrition-dataset"]["datasetVersion"]),
                    ("rules", bad["rules"], bad["rules"]["ruleSetVersion"]),
                    ("capability-manifest", manifest, manifest["artifactVersion"]),
                ):
                    artifacts[name] = approval_for(record, version)
                artifacts["sources"][source["id"]] = approval_for(
                    source, source["datasetVersion"]
                )

                errors = validator.validate_bundle(bad, ROOT.parent)

                self.assertTrue(any("http(s)" in error.lower() and source["id"] in error
                                    for error in errors))

    def test_duplicate_serving_ids_are_rejected_within_a_food(self):
        bad = copy.deepcopy(self.bundle)
        source = synthetic_source(kind="portion")
        food = synthetic_food()
        food["servings"] = [
            {"id": "serving.bowl", "label": "Bowl", "grams": 100, "sourceId": source["id"]},
            {"id": "serving.bowl", "label": "Bowl", "grams": 200, "sourceId": source["id"]},
        ]
        bad["nutrition-dataset"]["sources"] = [source]
        bad["catalog"]["foods"] = [food]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("duplicate serving ID" in error for error in errors))

    def test_same_serving_id_is_allowed_on_different_foods(self):
        good = copy.deepcopy(self.bundle)
        source = synthetic_source(kind="portion")
        first = synthetic_food()
        first["id"] = "food.synthetic-one"
        second = synthetic_food()
        second["id"] = "food.synthetic-two"
        first["servings"] = [{"id": "serving.bowl", "label": "Bowl", "grams": 100, "sourceId": source["id"]}]
        second["servings"] = [{"id": "serving.bowl", "label": "Bowl", "grams": 200, "sourceId": source["id"]}]
        good["nutrition-dataset"]["sources"] = [source]
        good["catalog"]["foods"] = [first, second]

        self.assertEqual(validator.validate_bundle(good, ROOT.parent), [])

    def test_rejects_stale_artifact_approval_version_or_content(self):
        version_keys = {
            "catalog": "catalogVersion",
            "nutrition-dataset": "datasetVersion",
            "rules": "ruleSetVersion",
            "capability-manifest": "artifactVersion",
        }
        for name, version_key in version_keys.items():
            with self.subTest(artifact=name, mutation="version"):
                bad_version = copy.deepcopy(self.bundle)
                record = bad_version[name]
                bad_version["review-metadata"]["artifacts"][name] = approval_for(
                    record, "older-version"
                )
                version_errors = validator.validate_bundle(bad_version, ROOT.parent)
                self.assertTrue(any(f"{name} approval" in error.lower() and "version" in error.lower()
                                    for error in version_errors))

            with self.subTest(artifact=name, mutation="content"):
                bad_content = copy.deepcopy(self.bundle)
                record = bad_content[name]
                bad_content["review-metadata"]["artifacts"][name] = approval_for(
                    record, record[version_key]
                )
                bad_content[name]["artifactVersion"] = "changed-after-review"
                content_errors = validator.validate_bundle(bad_content, ROOT.parent)
                self.assertTrue(any(f"{name} approval" in error.lower() and "content" in error.lower()
                                    for error in content_errors))

    def test_rejects_stale_source_and_rule_approvals(self):
        bad = copy.deepcopy(self.bundle)
        source = synthetic_source(kind="health_rule")
        rule = synthetic_rule()
        bad["nutrition-dataset"]["sources"] = [source]
        bad["rules"]["conditions"] = [{
            "id": rule["conditionId"], "displayName": "Synthetic test condition",
            "personalizationSupported": False, "requiredProfileFields": [],
            "requiredNutrients": [], "supportedAgeMinimum": None, "supportedAgeMaximum": None,
        }]
        bad["rules"]["rules"] = [rule]
        bad["capability-manifest"]["conditions"] = copy.deepcopy(bad["rules"]["conditions"])
        bad["review-metadata"]["artifacts"]["sources"][source["id"]] = approval_for(
            source, source["datasetVersion"]
        )
        bad["review-metadata"]["artifacts"]["rulesById"][rule["id"]] = approval_for(
            rule, rule["version"]
        )

        stale_version = copy.deepcopy(bad)
        stale_version["review-metadata"]["artifacts"]["sources"][source["id"]]["boundVersion"] = "old-source-version"
        stale_version["review-metadata"]["artifacts"]["rulesById"][rule["id"]]["boundVersion"] = "old-rule-version"
        version_errors = validator.validate_bundle(stale_version, ROOT.parent)
        self.assertTrue(any("source approval" in error.lower() and "version" in error.lower()
                            for error in version_errors))
        self.assertTrue(any("rule approval" in error.lower() and "version" in error.lower()
                            for error in version_errors))

        bad["nutrition-dataset"]["sources"][0]["basis"] = "edited after approval"
        bad["rules"]["rules"][0]["reason"] = "edited after approval"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("source approval" in error.lower() and "content" in error.lower()
                            for error in errors))
        self.assertTrue(any("rule approval" in error.lower() and "content" in error.lower()
                            for error in errors))

    def test_malformed_artifact_shapes_return_schema_errors_without_traversal(self):
        bad = copy.deepcopy(self.bundle)
        bad["nutrition-dataset"]["sources"] = None

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("nutrition-dataset.schema.json" in error for error in errors))


if __name__ == "__main__":
    unittest.main()

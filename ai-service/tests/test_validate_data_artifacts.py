"""Tests for fail-closed AI data artifact validation. All values are synthetic."""

import copy
import importlib.util
import math
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "validate_data_artifacts", ROOT / "validate_data_artifacts.py"
)
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


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

    def test_rejects_inconsistent_artifact_versions(self):
        bad = copy.deepcopy(self.bundle)
        bad["nutrition-dataset"]["datasetVersion"] = "nutrition-other"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("version mismatch" in error for error in errors))

    def test_rejects_invalid_numeric_data(self):
        bad = copy.deepcopy(self.bundle)
        bad["catalog"]["foods"] = [validator.synthetic_food()]
        bad["catalog"]["foods"][0]["per100g"]["energyKcal"] = -1

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("per100g" in error or "minimum" in error for error in errors))

    def test_synthetic_food_projection_matches_shared_wire_schema(self):
        staged = copy.deepcopy(self.bundle)
        source = validator.synthetic_source()
        food = validator.synthetic_food()
        food["per100g"]["energyKcal"] = 123.5
        food["nutrientSourceIds"]["energyKcal"] = source["id"]
        staged["nutrition-dataset"]["sources"] = [source]
        staged["catalog"]["foods"] = [food]
        staged["capability-manifest"]["supportedPhotoFoodIds"] = [food["id"]]
        staged["capability-manifest"]["nutrients"] = ["energyKcal"]

        self.assertEqual(validator.validate_bundle(staged, ROOT.parent), [])

    def test_rejects_non_finite_numeric_data(self):
        bad = copy.deepcopy(self.bundle)
        bad["catalog"]["foods"] = [validator.synthetic_food()]
        bad["catalog"]["foods"][0]["per100g"]["energyKcal"] = math.nan

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("per100g" in error or "finite" in error for error in errors))

    def test_rejects_publication_without_complete_approval_metadata(self):
        bad = copy.deepcopy(self.bundle)
        bad["capability-manifest"]["publicationStatus"] = "published"
        bad["capability-manifest"]["dataMode"] = "real"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("approval" in error.lower() for error in errors))

    def test_rejects_synthetic_source_promoted_to_real(self):
        bad = copy.deepcopy(self.bundle)
        bad["nutrition-dataset"]["sources"] = [validator.synthetic_source()]
        bad["capability-manifest"]["publicationStatus"] = "published"
        bad["capability-manifest"]["dataMode"] = "real"

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("synthetic" in error.lower() for error in errors))

    def test_rejects_rule_citation_to_unknown_source(self):
        bad = copy.deepcopy(self.bundle)
        bad["rules"]["rules"] = [validator.synthetic_rule()]
        bad["rules"]["rules"][0]["citationSourceIds"] = ["source.missing"]

        errors = validator.validate_bundle(bad, ROOT.parent)

        self.assertTrue(any("unknown source" in error.lower() for error in errors))


if __name__ == "__main__":
    unittest.main()

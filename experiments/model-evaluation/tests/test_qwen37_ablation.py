import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from run_qwen37_ablation import COMBO, ground_nutrients, normalize_native, prompt_for, lefood_label
from test_runner import envelope


def catalog():
    return {"version": "synthetic-test-only", "foods": [{"canonical_name": "cooked rice",
        "aliases": ["cooked rice"], "basis_grams": 100, "source": {"fdc_id": 123},
        "per_100g": {"energy_kcal": 130, "protein_g": 2, "carbohydrate_g": 28, "fat_g": 0}}]}


class AblationTests(unittest.TestCase):
    def test_combo_grounding_and_geometry_are_preserved_without_vlm_nutrients(self):
        native = {"is_food": True, "container_diameter_cm": 20, "apparent_volume_cm3": 60,
                  "weight_g": 50, "components": [{"food_name": "cooked rice", "weight_g": 50}],
                  "limitations": []}
        response = envelope(); response["choices"][0]["message"]["content"] = json.dumps(native)
        result, details = normalize_native(COMBO, response, catalog())
        parsed = json.loads(result["choices"][0]["message"]["content"])
        self.assertEqual(parsed["prediction"]["energy_kcal"], 65)
        self.assertEqual(parsed["prediction"]["mass_g"], 50)
        self.assertEqual(details["intermediates"]["apparent_volume_cm3"], 60)
        self.assertTrue(details["intermediates_before_weight"])
        native["weight_g"] = 99
        response["choices"][0]["message"]["content"] = json.dumps(native)
        with self.assertRaisesRegex(ValueError, "Total weight differs"):
            normalize_native(COMBO, response, catalog())

    def test_combo_nonfood_and_unknown_mass_preserve_null(self):
        native = {"is_food": False, "container_diameter_cm": None, "apparent_volume_cm3": None,
                  "weight_g": None, "components": [], "limitations": []}
        response = envelope(); response["choices"][0]["message"]["content"] = json.dumps(native)
        result, _ = normalize_native(COMBO, response, catalog())
        self.assertTrue(all(v is None for v in json.loads(result["choices"][0]["message"]["content"])["prediction"].values()))
        native.update(is_food=True, components=[{"food_name": "cooked rice", "weight_g": None}])
        response["choices"][0]["message"]["content"] = json.dumps(native)
        result, _ = normalize_native(COMBO, response, catalog())
        self.assertIsNone(json.loads(result["choices"][0]["message"]["content"])["prediction"]["mass_g"])

    def test_grounding_divides_by_100_and_preserves_known_zero(self):
        prediction, matches = ground_nutrients([{"name": "cooked rice", "mass_g": 50}], catalog())
        self.assertEqual(prediction["energy_kcal"], 65)
        self.assertEqual(prediction["fat_g"], 0)
        self.assertEqual(matches[0]["source"]["fdc_id"], 123)

    def test_unmatched_component_does_not_produce_complete_nutrient_total(self):
        prediction, _ = ground_nutrients([{"name": "cooked rice", "mass_g": 50},
                                          {"name": "unmatched sauce", "mass_g": 20}], catalog())
        self.assertEqual(prediction["mass_g"], 70)
        self.assertIsNone(prediction["energy_kcal"])
        prediction, _ = ground_nutrients([{"name": "cooked rice", "mass_g": None}], catalog())
        self.assertIsNone(prediction["mass_g"])
        self.assertIsNone(prediction["energy_kcal"])

    def test_nonfood_grounding_is_null_not_zero(self):
        prediction, matches = ground_nutrients([], catalog())
        self.assertTrue(all(v is None for v in prediction.values()))
        self.assertEqual(matches, [])

    def test_catalog_without_100g_basis_is_rejected(self):
        data = catalog(); data["foods"][0]["basis_grams"] = 50
        with self.assertRaises(ValueError):
            ground_nutrients([], data)

    def test_geometry_is_logged_without_silently_changing_reported_weight(self):
        native = {"is_food": True, "container_diameter_cm": 20, "apparent_volume_cm3": 200,
                  "packing_factor": 0.8, "density_g_cm3": 0.85, "weight_g": 150,
                  "components": [{"name": "rice", "mass_g": 150}],
                  "prediction": {"energy_kcal": 195, "protein_g": 4, "carbohydrate_g": 40, "fat_g": 0},
                  "limitations": ["Synthetic geometry"]}
        response = envelope(); response["choices"][0]["message"]["content"] = json.dumps(native)
        normalized, extra = normalize_native("A1V2", response)
        self.assertEqual(json.loads(normalized["choices"][0]["message"]["content"])["prediction"]["mass_g"], 150)
        self.assertEqual(extra["physics_product_g"], 136)
        self.assertTrue(extra["intermediates_before_weight"])
        native["packing_factor"] = 2
        response["choices"][0]["message"]["content"] = json.dumps(native)
        with self.assertRaises(ValueError): normalize_native("A1V2", response)

    def test_grounded_schema_rejects_vlm_nutrient_estimates(self):
        native = {"is_food": True, "components": [{"food_name": "cooked rice", "weight_g": 50}],
                  "limitations": [], "calories": 999}
        response = envelope(); response["choices"][0]["message"]["content"] = json.dumps(native)
        with self.assertRaises(ValueError): normalize_native("A6V1", response, catalog())

    def test_nonfood_null_object_does_not_silently_repair_invalid_schema(self):
        native = {"is_food": False, "container_diameter_cm": None, "apparent_volume_cm3": None,
                  "weight_g": None, "components": [], "prediction": None, "limitations": []}
        response = envelope(); response["choices"][0]["message"]["content"] = json.dumps(native)
        with self.assertRaisesRegex(ValueError, "Invalid native nutrient fields"):
            normalize_native("A1V1", response)

    def test_label_mapping_does_not_accept_ambiguous_rice_or_porridge(self):
        def row(name): return {"status": "ok", "components": [{"name": name}]}
        self.assertEqual(lefood_label(row("white rice porridge")), "Bubur")
        self.assertEqual(lefood_label(row("steamed white rice")), "Nasi")
        self.assertIsNone(lefood_label(row("cooked rice or porridge")))

    def test_resolution_and_cv_groups_preserve_baseline_prompt(self):
        text = "fixed baseline JSON prompt"
        for variant in ("A3V1", "A3V2", "A4V1", "A4V2"):
            self.assertEqual(prompt_for(variant, text), text)


if __name__ == "__main__":
    unittest.main()

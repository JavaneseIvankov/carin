import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from run_extended_nutrients import COLUMNS, aggregate_reference, metrics, response_format, validate_output


def response(food=True):
    native = {"is_food": food, "container_diameter_cm": 20 if food else None,
              "apparent_volume_cm3": 100 if food else None, "weight_g": 80 if food else None,
              "components": [{"name": "food", "mass_g": 80}] if food else [],
              "prediction": {name: 1 if food else None for name in COLUMNS if name != "mass_g"}, "limitations": []}
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(native)}}]}


class ExtendedNutrientTests(unittest.TestCase):
    def test_source_already_contains_totals_units_are_not_rescaled_and_missing_is_not_zero(self):
        rows = [{column: "2" for column in COLUMNS.values()}, {column: "3" for column in COLUMNS.values()}]
        self.assertEqual(aggregate_reference(rows)["sodium_mg"], 5)
        self.assertEqual(aggregate_reference(rows)["total_sugars_g"], 5)
        self.assertEqual(aggregate_reference(rows)["mass_g"], 5)
        rows[1]["SODI"] = "NA"
        self.assertIsNone(aggregate_reference(rows)["sodium_mg"])
        self.assertEqual(aggregate_reference(rows)["total_sugars_g"], 5)

    def test_expanded_schema_and_parser_reject_wrong_units_keys_and_invalid_values(self):
        schema = response_format()["json_schema"]["schema"]["properties"]["prediction"]
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(set(schema["required"]), set(COLUMNS) - {"mass_g"})
        self.assertEqual(validate_output(response())["prediction"]["sodium_mg"], 1)
        for value in (-1, True, "100"):
            raw = response(); native = json.loads(raw["choices"][0]["message"]["content"])
            native["prediction"]["sodium_mg"] = value
            raw["choices"][0]["message"]["content"] = json.dumps(native)
            with self.subTest(value=value), self.assertRaises(ValueError): validate_output(raw)
        raw = response(); native = json.loads(raw["choices"][0]["message"]["content"])
        native["prediction"]["salt_g"] = native["prediction"].pop("sodium_mg")
        raw["choices"][0]["message"]["content"] = json.dumps(native)
        with self.assertRaises(ValueError): validate_output(raw)
        self.assertTrue(all(value is None for value in validate_output(response(False))["prediction"].values()))

    def test_null_prediction_has_no_numeric_error_pair_but_true_zero_is_scored(self):
        refs = [{"sample_id": "1", "reference": {name: 10 for name in COLUMNS}}]
        preds = {"1": {"status": "ok", "prediction": {name: None for name in COLUMNS}}}
        self.assertEqual(metrics(refs, preds)["sodium_mg"], {"mae": None, "bias": None, "pairs": 0, "available": 1})
        preds["1"]["prediction"]["sodium_mg"] = 0
        self.assertEqual(metrics(refs, preds)["sodium_mg"]["mae"], 10)
        self.assertEqual(metrics(refs, preds)["sodium_mg"]["pairs"], 1)


if __name__ == "__main__": unittest.main()

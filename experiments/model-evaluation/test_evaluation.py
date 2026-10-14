import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import zipfile

from download_datasets import (
    METRICS, balanced_sample, get_image, lefood_records, parse_nutrition_csv,
)
from evaluate_predictions import score


def workbook(rows):
    cells = []
    for index, row in enumerate(rows, 1):
        content = "".join(f'<c r="{column}{index}" t="inlineStr"><is><t>{value}</t></is></c>'
                          for column, value in row.items())
        cells.append(f'<row r="{index}">{content}</row>')
    xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    xml += "".join(cells) + "</sheetData></worksheet>"
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", xml)
    return output.getvalue()


class DatasetTests(unittest.TestCase):
    def test_published_nutrition_csv_layout_and_zero(self):
        raw = b"dish_1,100,50,0,20,5,ingr_1,rice,50,100,0,20,5\n"
        record = parse_nutrition_csv(raw)["dish_1"]
        self.assertEqual(record["reference"]["mass_g"], 50)
        self.assertEqual(record["reference"]["fat_g"], 0)
        self.assertEqual(record["ingredients"][0]["name"], "rice")
        self.assertEqual(record["ingredients"][0]["protein_g"], 5)

    def test_malformed_nutrition_row_fails(self):
        with self.assertRaises(ValueError):
            parse_nutrition_csv(b"dish_1,100,50,0,20,5,2,ingr_1,rice,50\n")

    def test_sampling_is_reproducible_balanced_and_unique(self):
        records = [{"sample_id": str(index), "group": str(index % 3)} for index in range(20)]
        sample = balanced_sample(records, 6, 32, lambda row: row["group"])
        self.assertEqual(sample, balanced_sample(list(reversed(records)), 6, 32, lambda row: row["group"]))
        self.assertEqual(len({row["sample_id"] for row in sample}), 6)
        self.assertEqual([sum(row["group"] == group for row in sample) for group in ("0", "1", "2")], [2, 2, 2])
        with self.assertRaises(ValueError):
            balanced_sample(records, 21, 32, lambda row: row["group"])

    def test_lefood_before_weights_dedup_and_unknown_nutrients(self):
        header = {"A": "ID", "B": "Name of the food", "C": "Image Before Eaten", "D": "Weight Before Eaten (g)"}
        row = {"A": "1", "B": "Nasi", "C": "rice_bef.JPG", "D": "150", "F": "20"}
        files = [{"filename": "rice_bef.JPG", "id": "file1", "content_details": {
            "sha256_hash": "hash1", "download_url": "https://example.invalid/image", "size": 100}}]
        audit = {}
        missing = dict(row, A="3", C="missing_bef.JPG")
        records = lefood_records(workbook([header, row, dict(row, A="2"), missing, {}]), files, audit)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["reference"]["mass_g"], 150)
        self.assertIsNone(records[0]["reference"]["energy_kcal"])
        self.assertEqual(audit["duplicate_image_rows"], [3])
        self.assertEqual(audit["unavailable_image_rows"][0]["source_row"], 4)

    def test_existing_image_corruption_is_not_silently_redownloaded(self):
        data = b"\x89PNG\r\n\x1a\nfixture"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "image.png").write_bytes(data)
            record = {"sample_id": "sample", "image_path": "image.png", "image_sha256": "wrong"}
            with self.assertRaises(ValueError):
                get_image(root, record)
            record["image_sha256"] = hashlib.sha256(data).hexdigest()
            with patch("download_datasets.fetch", side_effect=AssertionError("unexpected network")):
                self.assertEqual(get_image(root, record)["image_bytes"], len(data))


class ScoringTests(unittest.TestCase):
    def references(self):
        return [{"sample_id": sample_id, "dataset": "lefood-set",
                 "reference": {key: 150 if key == "mass_g" else None for key in METRICS}}
                for sample_id in ("a", "b", "c")]

    def test_missing_errors_and_nulls_do_not_become_zero(self):
        predictions = [{"sample_id": "a", "status": "ok", "prediction": {"mass_g": 180, "energy_kcal": 500}},
                       {"sample_id": "b", "status": "error"}]
        result = score(self.references(), predictions)
        self.assertEqual(result["missing_response_count"], 1)
        self.assertEqual(result["error_response_count"], 1)
        self.assertEqual(result["metrics"]["mass_g"]["mae"], 30)
        self.assertAlmostEqual(result["metrics"]["mass_g"]["coverage"], 1 / 3)
        self.assertIsNone(result["metrics"]["energy_kcal"]["mae"])
        self.assertIsNone(result["metrics"]["energy_kcal"]["coverage"])

    def test_invalid_and_duplicate_predictions_fail(self):
        for value in (True, -1, float("nan"), float("inf"), "150"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                score(self.references(), [{"sample_id": "a", "status": "ok", "prediction": {"mass_g": value}}])
        prediction = {"sample_id": "a", "status": "error"}
        with self.assertRaises(ValueError):
            score(self.references(), [prediction, prediction])
        with self.assertRaises(ValueError):
            score(self.references(), [{"sample_id": "unknown", "status": "error"}])


if __name__ == "__main__":
    unittest.main()

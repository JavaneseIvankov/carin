import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from compare_qwen37_variants import aggregate_metrics
from download_datasets import METRICS


class ComparisonTests(unittest.TestCase):
    def test_normalization_removes_different_units_with_explicit_equal_weights(self):
        truth = dict(zip(METRICS, [100, 200, 10, 20, 5]))
        key = ("test", "1")
        metrics = aggregate_metrics({key:{"reference":truth}},
                                    {key:{"status":"ok", "prediction":{m:v*2 for m,v in truth.items()}}})
        self.assertEqual(metrics["overall_normalized_mae_pct"], 100)
        self.assertEqual(metrics["energy_kcal"]["mae"], 200)
        self.assertEqual(metrics["fat_g"]["mae"], 5)

    def test_pooled_mass_weights_samples_not_dataset_means(self):
        refs = {(ds, str(i)):{"reference":{"mass_g":100}} for i,ds in enumerate(["a","a","a","b"])}
        preds = {k:{"status":"ok", "prediction":{"mass_g":200 if k[0]=="b" else 100}} for k in refs}
        result = aggregate_metrics(refs, preds)
        self.assertEqual(result["mass_g"]["mae"], 25)
        self.assertEqual(result["mass_g"]["pairs"], 4)
        self.assertIsNone(result["energy_kcal"]["mae"])
        self.assertIsNone(result["overall_normalized_mae_pct"])

    def test_missing_prediction_cannot_win_through_partial_numeric_coverage(self):
        refs = {("test", str(i)):{"reference":{m:100 for m in METRICS}} for i in range(2)}
        preds = {("test","0"):{"status":"ok", "prediction":{m:100 for m in METRICS}},
                 ("test","1"):{"status":"error"}}
        result = aggregate_metrics(refs, preds)
        self.assertEqual(result["mass_g"]["mae"], 0)
        self.assertFalse(result["mass_g"]["complete"])
        self.assertIsNone(result["mass_g"]["normalized_mae_pct"])
        self.assertIsNone(result["overall_normalized_mae_pct"])


if __name__ == "__main__": unittest.main()

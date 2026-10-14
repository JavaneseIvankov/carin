"""Offline checks for native JSON normalization and HF provider failure handling."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from huggingface_hub import ModelInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import run_hf_food_analysis as runner


def native(portions=None):
    return {"dish_name": "rice", "food_type": "cooked", "cooking_method": "steamed",
            "portion_size": {"rice": 150} if portions is None else portions,
            "nutritional_summary": {"calories_kcal": 195, "protein_g": 4.1,
                                    "carbohydrate_g": 42.3, "fat_g": 0.4}}


def model_info(served=True):
    return ModelInfo(id=runner.MODEL, sha="revision", inferenceProviderMapping={
        "hf-inference": {"status": "live", "task": "conversational", "providerId": runner.MODEL},
    } if served else {})


@dataclass
class Reply:
    choices: list
    model: str = runner.MODEL
    usage: dict | None = None


def reply(output=None, finish="stop"):
    return Reply([{"finish_reason": finish, "message": {
        "content": json.dumps(native() if output is None else output), "role": "assistant",
    }}])


class ParsingTests(unittest.TestCase):
    def test_known_components_sum_to_total(self):
        _, prediction = runner.parse_food_analysis(json.dumps(native({"rice": 100, "egg": 50})))
        self.assertEqual(prediction["mass_g"], 150)
        self.assertEqual(prediction["energy_kcal"], 195)

    def test_unknown_component_does_not_become_known_total(self):
        for portions in ({"rice": 100, "sauce": None}, {}):
            _, prediction = runner.parse_food_analysis(json.dumps(native(portions)))
            self.assertIsNone(prediction["mass_g"])

    def test_invalid_measurements_and_unit_strings_are_rejected(self):
        for value in (-1, True, float("inf"), "150 g", "1 cup"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                runner.parse_food_analysis(json.dumps(native({"rice": value})))
        output = native()
        output["nutritional_summary"]["calories_kcal"] = -1
        with self.assertRaises(ValueError):
            runner.parse_food_analysis(json.dumps(output))


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run_dir = self.root / "run"
        image = b"\xff\xd8\xffmock-image"
        (self.root / "image.jpg").write_bytes(image)
        self.references = [{"dataset": "lefood-set", "sample_id": f"test-{n}",
                            "image_path": "image.jpg", "image_sha256": hashlib.sha256(image).hexdigest(),
                            "food_name": "GT_NAME_MUST_NOT_ENTER_REQUEST",
                            "reference": {"mass_g": 200, "energy_kcal": None, "protein_g": None,
                                          "carbohydrate_g": None, "fat_g": None}} for n in range(2)]
        self.root_patch = patch.object(runner, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def test_unsupported_provider_blocks_without_inference_or_mae(self):
        with patch.object(runner, "HfApi") as api, patch.object(runner, "InferenceClient") as client:
            api.return_value.model_info.return_value = model_info(served=False)
            result = runner.run_smoke(self.references, self.run_dir, "fixed prompt", None)
        self.assertEqual(result, 2)
        client.assert_not_called()
        summary = json.loads((self.run_dir / "summary.json").read_text())
        self.assertEqual(summary["attempted_count"], 0)
        self.assertEqual(summary["blockers"], ["model_not_served_by_hf_inference", "missing_hf_token"])
        self.assertNotIn("report", summary)

    def test_dry_run_makes_no_metadata_or_inference_calls(self):
        with patch.object(runner, "HfApi") as api, patch.object(runner, "InferenceClient") as client:
            self.assertEqual(runner.run_smoke(self.references, self.run_dir, "fixed prompt", None, True), 0)
        api.assert_not_called()
        client.assert_not_called()

    def test_unlisted_probe_attempts_only_one_image(self):
        failure = RuntimeError("permission denied")
        failure.response = SimpleNamespace(status_code=403)
        with patch.object(runner, "HfApi") as api, patch.object(runner, "InferenceClient") as client:
            api.return_value.model_info.return_value = model_info(served=False)
            client.return_value.chat_completion.side_effect = failure
            result = runner.run_smoke(self.references, self.run_dir, "fixed prompt", "hf-test",
                                      probe_unlisted=True)
        self.assertEqual(result, 1)
        self.assertEqual(client.return_value.chat_completion.call_count, 1)
        report = json.loads((self.run_dir / "report.json").read_text())
        self.assertEqual(report["error_response_count"], 1)
        self.assertEqual(report["missing_response_count"], 1)
        self.assertIsNone(report["metrics"]["mass_g"]["mae"])

    def test_success_scores_portion_only_and_does_not_send_gt(self):
        with patch.object(runner, "HfApi") as api, patch.object(runner, "InferenceClient") as client:
            api.return_value.model_info.return_value = model_info()
            client.return_value.chat_completion.return_value = reply()
            result = runner.run_smoke(self.references, self.run_dir, "fixed prompt", "hf-test-secret")
        self.assertEqual(result, 0)
        client.assert_called_once_with(provider="hf-inference", token="hf-test-secret", timeout=120)
        for call in client.return_value.chat_completion.call_args_list:
            self.assertEqual(call.kwargs["model"], "Ateeqq/food-analysis")
            payload = json.dumps(call.kwargs["messages"])
            self.assertNotIn("GT_NAME_MUST_NOT_ENTER_REQUEST", payload)
            self.assertNotIn("test-", payload)
        report = json.loads((self.run_dir / "report.json").read_text())
        self.assertEqual(report["metrics"]["mass_g"]["mae"], 50)
        self.assertIsNone(report["metrics"]["energy_kcal"]["mae"])
        for path in self.run_dir.rglob("*"):
            if path.is_file():
                self.assertNotIn("hf-test-secret", path.read_text())

    def test_truncated_output_is_error_and_not_scored(self):
        with patch.object(runner, "HfApi") as api, patch.object(runner, "InferenceClient") as client:
            api.return_value.model_info.return_value = model_info()
            client.return_value.chat_completion.return_value = reply(finish="length")
            result = runner.run_smoke(self.references, self.run_dir, "fixed prompt", "hf-test")
        self.assertEqual(result, 1)
        report = json.loads((self.run_dir / "report.json").read_text())
        self.assertEqual(report["error_response_count"], 2)
        self.assertIsNone(report["metrics"]["mass_g"]["mae"])

    def test_auth_error_stops_batch_and_does_not_log_error_body(self):
        failure = RuntimeError("sensitive provider body hf-test-secret")
        failure.response = SimpleNamespace(status_code=401)
        with patch.object(runner, "HfApi") as api, patch.object(runner, "InferenceClient") as client:
            api.return_value.model_info.return_value = model_info()
            client.return_value.chat_completion.side_effect = failure
            self.assertEqual(runner.run_smoke(self.references, self.run_dir, "fixed prompt", "hf-test-secret"), 1)
        self.assertEqual(client.return_value.chat_completion.call_count, 1)
        report = json.loads((self.run_dir / "report.json").read_text())
        self.assertEqual(report["missing_response_count"], 1)
        self.assertNotIn("sensitive provider body", (self.run_dir / "predictions/lefood-set.jsonl").read_text())


if __name__ == "__main__":
    unittest.main()

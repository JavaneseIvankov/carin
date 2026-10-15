import base64
from contextlib import redirect_stdout
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from download_datasets import METRICS
from run_evaluation import (
    NoRedirects, ProviderError, limit_total_samples, load_env, main, make_payload, parse_model_response,
    provider_call, run_pipeline, validate_base_url, validate_samples, validate_vision_model,
)

IMAGE = b"\x89PNG\r\n\x1a\nsynthetic-test-image"


def envelope():
    result = {"is_food": True, "components": [{"name": "rice", "mass_g": 150}],
              "prediction": {name: 150 if name == "mass_g" else None for name in METRICS},
              "limitations": ["Portion is uncertain"]}
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(result)}}],
            "model": "provider-returned-model-revision", "id": "completion-test",
            "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}}


class AdapterTests(unittest.TestCase):
    def test_total_limit_selects_exactly_five_across_datasets(self):
        references = {"nutrition5k": list(range(50)), "lefood-set": list(range(50))}
        result = limit_total_samples(references, 5)
        self.assertEqual(result, {"nutrition5k": [0, 1, 2], "lefood-set": [0, 1]})
        self.assertEqual(limit_total_samples({"single": list(range(5))}, 5)["single"], list(range(5)))
        for total in (0, 1, 101):
            with self.subTest(total=total), self.assertRaises(ValueError):
                limit_total_samples(references, total)

    def test_payload_contains_image_and_fixed_prompt_only(self):
        payload = make_payload("vision-model", IMAGE, "fixed JSON task", 512, True, False)
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertFalse(payload["enable_thinking"])
        parts = payload["messages"][0]["content"]
        self.assertEqual(base64.b64decode(parts[0]["image_url"]["url"].split(",")[1]), IMAGE)
        self.assertEqual(parts[1]["text"], "fixed JSON task")
        self.assertEqual(set(payload), {"model", "messages", "temperature", "max_tokens", "stream",
                                       "enable_thinking", "response_format"})
        self.assertNotIn("response_format", make_payload("v", IMAGE, "JSON", 512, False, False))

    def test_thinking_budget_high_resolution_and_json_coexist(self):
        payload = make_payload("qwen3.8-max", IMAGE, "fixed JSON task", 1024, True, True,
                               thinking_budget=4096, high_resolution_images=True)
        self.assertTrue(payload["enable_thinking"])
        self.assertEqual(payload["thinking_budget"], 4096)
        self.assertTrue(payload["vl_high_resolution_images"])
        self.assertEqual(payload["response_format"], {"type": "json_object"})

    def test_cli_records_custom_prompt_and_thinking_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            prompt = Path(directory) / "prompt.txt"
            prompt.write_text("custom fixed JSON task")
            environment = {"DASHSCOPE_API_KEY": "fake-key", "VLM_BASE_URL": "https://test.invalid/v1",
                           "VLM_MODEL": "qwen3.8-max", "VLM_ENABLE_THINKING": "true",
                           "VLM_JSON_MODE": "true", "VLM_THINKING_BUDGET": "4096",
                           "VLM_HIGH_RESOLUTION_IMAGES": "true"}
            with patch.dict(os.environ, environment, clear=True), \
                    patch("run_evaluation.validate_samples", return_value=[{"sample_id": "test"}]), \
                    patch("run_evaluation.run_pipeline", return_value={}) as pipeline, \
                    redirect_stdout(io.StringIO()):
                result = main(["--env-file", str(Path(directory) / "absent.env"),
                               "--dataset", "lefood-set", "--limit", "1", "--prompt", str(prompt)])
            self.assertEqual(result, 0)
            config = pipeline.call_args.args[3]
            self.assertTrue(config["enable_thinking"])
            self.assertTrue(config["json_mode"])
            self.assertEqual(config["thinking_budget"], 4096)
            self.assertTrue(config["high_resolution_images"])
            self.assertEqual(pipeline.call_args.args[4], prompt.read_text())

    def test_disabled_thinking_rejects_budget_before_request(self):
        environment = {"DASHSCOPE_API_KEY": "fake-key", "VLM_BASE_URL": "https://test.invalid/v1",
                       "VLM_MODEL": "qwen3.8-max", "VLM_THINKING_BUDGET": "4096"}
        with patch.dict(os.environ, environment, clear=True), \
                patch("run_evaluation.provider_call") as call, \
                patch("sys.stderr", new_callable=io.StringIO):
            self.assertEqual(main(["--env-file", "/nonexistent/test.env"]), 2)
        call.assert_not_called()

    def test_parser_preserves_zero_and_unknowns(self):
        response = envelope()
        result = json.loads(response["choices"][0]["message"]["content"])
        result["prediction"]["fat_g"] = 0
        response["choices"][0]["message"]["content"] = json.dumps(result)
        parsed = parse_model_response(response)
        self.assertEqual(parsed["prediction"]["fat_g"], 0)
        self.assertIsNone(parsed["prediction"]["protein_g"])

    def test_parser_rejects_truncation_invalid_numbers_and_malformed_envelopes(self):
        cases = [None, {}, {"choices": []}, {"choices": [None]}]
        for value in (True, -1, float("nan"), "150"):
            response = envelope()
            result = json.loads(response["choices"][0]["message"]["content"])
            result["prediction"]["mass_g"] = value
            response["choices"][0]["message"]["content"] = json.dumps(result)
            cases.append(response)
        for reason in ("length", "content_filter"):
            response = envelope()
            response["choices"][0]["finish_reason"] = reason
            cases.append(response)
        response = envelope()
        response["choices"][0]["message"]["content"] = "```json\n{}\n```"
        cases.append(response)
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ProviderError):
                parse_model_response(case)

    def test_nonfood_cannot_produce_numeric_estimates(self):
        response = envelope()
        result = json.loads(response["choices"][0]["message"]["content"])
        result.update(is_food=False, components=[])
        response["choices"][0]["message"]["content"] = json.dumps(result)
        with self.assertRaises(ProviderError):
            parse_model_response(response)
        result["prediction"] = dict.fromkeys(METRICS)
        response["choices"][0]["message"]["content"] = json.dumps(result)
        self.assertFalse(parse_model_response(response)["is_food"])

    def test_transport_retries_rate_limit_but_not_auth(self):
        opener = MagicMock()
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(envelope()).encode()
        opener.open.side_effect = [urllib.error.HTTPError("https://test.invalid", 429, "limited", {}, io.BytesIO(b"secret")), response]
        with patch("run_evaluation.urllib.request.build_opener", return_value=opener), patch("run_evaluation.time.sleep") as sleep:
            result, attempts = provider_call("https://test.invalid/v1", "fake-key", {"model": "v"}, 10, 2)
        self.assertEqual(attempts, 2)
        self.assertEqual(result["id"], "completion-test")
        sleep.assert_called_once_with(1)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://test.invalid/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer fake-key")
        opener.open.side_effect = urllib.error.HTTPError("https://test.invalid", 401, "auth", {}, io.BytesIO(b"fake-key"))
        with patch("run_evaluation.urllib.request.build_opener", return_value=opener), self.assertRaises(ProviderError) as failure:
            provider_call("https://test.invalid/v1", "fake-key", {}, 10, 2)
        self.assertEqual(failure.exception.status, 401)
        self.assertEqual(failure.exception.attempts, 1)
        self.assertNotIn("fake-key", str(failure.exception))

    def test_network_timeout_is_bounded(self):
        opener = MagicMock()
        opener.open.side_effect = TimeoutError()
        with patch("run_evaluation.urllib.request.build_opener", return_value=opener), patch("run_evaluation.time.sleep"), self.assertRaises(ProviderError) as failure:
            provider_call("https://test.invalid/v1", "fake-key", {}, 1, 1)
        self.assertEqual(opener.open.call_count, 2)
        self.assertEqual(failure.exception.attempts, 2)

    def test_endpoint_validation_and_redirect_blocking(self):
        self.assertEqual(validate_base_url("https://workspace.example/compatible-mode/v1/"),
                         "https://workspace.example/compatible-mode/v1")
        for url in ("http://example/v1", "https://user:pass@example/v1", "https://example/v1?key=x",
                    "https://YOUR_WORKSPACE_ID.example/v1", "https://example/v1/chat/completions"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_base_url(url)
        self.assertIsNone(NoRedirects().redirect_request(None, None, 302, "", {}, "https://another.example"))

    def test_known_text_only_model_is_rejected_for_images(self):
        with self.assertRaises(ValueError):
            validate_vision_model("deepseek-v4-flash-0731")
        validate_vision_model("qwen3.7-flash-2026-07-15")
        validate_vision_model("qwen3.7-flash")

    def test_environment_file_is_data_and_shell_environment_wins(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"DASHSCOPE_API_KEY": "existing-key"}, clear=True):
            path = Path(directory) / ".env"
            path.write_text('DASHSCOPE_API_KEY=ignored-key\nVLM_MODEL="$(never_execute)"\n')
            load_env(path)
            self.assertEqual(os.environ["DASHSCOPE_API_KEY"], "existing-key")
            self.assertEqual(os.environ["VLM_MODEL"], "$(never_execute)")

    def test_cli_missing_credentials_fails_before_network(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True), \
                patch("run_evaluation.provider_call") as call, \
                patch("sys.stderr", new_callable=io.StringIO):
            result = main(["--env-file", str(Path(directory) / "absent.env"),
                           "--run-dir", str(Path(directory) / "run")])
            self.assertEqual(result, 2)
            call.assert_not_called()
            self.assertFalse((Path(directory) / "run").exists())


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "manifests").mkdir()
        (self.root / "image.png").write_bytes(IMAGE)
        self.references = {}
        for dataset in ("nutrition5k", "lefood-set"):
            rows = [{"sample_id": f"{dataset}-{index}", "dataset": dataset,
                     "food_name": "REFERENCE_NAME_MUST_NOT_LEAK", "image_path": "image.png",
                     "image_sha256": hashlib.sha256(IMAGE).hexdigest(), "image_bytes": len(IMAGE),
                     "reference": {name: 100 if name == "mass_g" else None for name in METRICS}}
                    for index in range(2)]
            self.references[dataset] = rows
            (self.root / "manifests" / f"{dataset}-50.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows))
        self.config = {"base_url": "https://workspace.example/v1", "model": "vision-model",
                       "timeout_seconds": 1, "max_retries": 0, "max_tokens": 128,
                       "json_mode": True, "enable_thinking": False}
        self.run_dir = self.root / "results" / "run"

    def run_pipeline(self, **kwargs):
        with redirect_stdout(io.StringIO()):
            return run_pipeline(self.root, self.run_dir, self.references, self.config,
                                "fixed JSON task", "fake-test-key", **kwargs)

    def test_complete_pipeline_scores_and_resume_skips_calls(self):
        def call(url, key, payload, timeout, retries):
            self.assertNotIn("REFERENCE_NAME_MUST_NOT_LEAK", json.dumps(payload))
            self.assertNotIn("sample_id", json.dumps(payload))
            response = envelope()
            result = json.loads(response["choices"][0]["message"]["content"])
            result["limitations"] = [key]
            response["choices"][0]["message"]["content"] = json.dumps(result)
            return response, 1
        reports = self.run_pipeline(call=call)
        self.assertEqual(reports["nutrition5k"]["metrics"]["mass_g"]["mae"], 50)
        self.assertEqual(reports["lefood-set"]["metrics"]["mass_g"]["coverage"], 1)
        self.assertIsNone(reports["lefood-set"]["metrics"]["energy_kcal"]["mae"])
        self.assertEqual(reports["nutrition5k"]["token_usage"]["totals"]["total_tokens"], 60)
        self.assertTrue((self.run_dir / "summary.csv").exists())
        for path in self.run_dir.rglob("*.json*"):
            self.assertNotIn("fake-test-key", path.read_text())
        never_call = MagicMock(side_effect=AssertionError("resume unexpectedly called API"))
        resumed = self.run_pipeline(resume=True, call=never_call)
        self.assertEqual(reports, resumed)
        never_call.assert_not_called()

    def test_dry_run_never_calls_provider_or_creates_predictions(self):
        call = MagicMock(side_effect=AssertionError("unexpected request"))
        self.assertEqual(self.run_pipeline(dry_run=True, call=call), {})
        call.assert_not_called()
        self.assertEqual(json.loads((self.run_dir / "run.json").read_text())["mode"], "dry_run")
        self.assertFalse((self.run_dir / "predictions").exists())
        self.assertFalse((self.run_dir / "summary.json").exists())

    def test_invalid_model_outputs_are_failures_and_other_samples_continue(self):
        def call(*args):
            response = envelope()
            response["choices"][0]["message"]["content"] = "not JSON"
            return response, 1
        reports = self.run_pipeline(call=call)
        for report in reports.values():
            self.assertEqual(report["error_response_count"], 2)
            self.assertEqual(report["metrics"]["mass_g"]["coverage"], 0)
            self.assertIsNone(report["metrics"]["mass_g"]["mae"])

    def test_auth_error_stops_further_requests_and_counts_missing(self):
        call = MagicMock(side_effect=ProviderError("http_error", 401))
        reports = self.run_pipeline(call=call)
        call.assert_called_once()
        self.assertEqual(reports["nutrition5k"]["error_response_count"], 1)
        self.assertEqual(reports["nutrition5k"]["missing_response_count"], 1)
        self.assertEqual(reports["lefood-set"]["missing_response_count"], 2)
        self.assertFalse((self.run_dir / ".running").exists())

    def test_retry_errors_is_explicit_and_replaces_record_without_duplicates(self):
        call = MagicMock(side_effect=[ProviderError("network_error"), (envelope(), 1),
                                     (envelope(), 1), (envelope(), 1)])
        self.run_pipeline(call=call)
        skip = MagicMock(side_effect=AssertionError("error retried implicitly"))
        self.run_pipeline(resume=True, call=skip)
        skip.assert_not_called()
        retry = MagicMock(return_value=(envelope(), 1))
        reports = self.run_pipeline(resume=True, retry_errors=True, call=retry)
        retry.assert_called_once()
        self.assertEqual(reports["nutrition5k"]["error_response_count"], 0)
        lines = (self.run_dir / "predictions" / "nutrition5k.jsonl").read_text().splitlines()
        self.assertEqual(len(lines), 2)

    def test_changed_configuration_cannot_resume(self):
        self.run_pipeline(call=MagicMock(return_value=(envelope(), 1)))
        self.config["model"] = "different-model"
        call = MagicMock()
        with self.assertRaises(ValueError):
            self.run_pipeline(resume=True, call=call)
        call.assert_not_called()

    def test_fallback_after_snapshot_unavailable_tracks_both_routes(self):
        self.config.update(model="qwen3.7-flash-2026-07-15", fallback_model="qwen3.7-flash")
        calls = []
        def call(url, key, payload, timeout, retries):
            calls.append(payload["model"])
            if payload["model"] == self.config["model"]:
                raise ProviderError("http_error", 404)
            return envelope(), 1
        reports = self.run_pipeline(call=call)
        self.assertEqual(len(calls), 8)
        self.assertEqual(calls[:2], [self.config["model"], self.config["fallback_model"]])
        report = reports["nutrition5k"]
        self.assertEqual(report["routing"]["fallback_final_count"], 2)
        self.assertEqual(report["routing"]["primary_failure_count"], 2)
        self.assertEqual(report["per_final_model"][self.config["fallback_model"]]["ok_response_count"], 2)
        rows = [json.loads(line) for line in (self.run_dir / "predictions/nutrition5k.jsonl").read_text().splitlines()]
        for row in rows:
            self.assertTrue(row["fallback_used"])
            self.assertEqual(row["requested_model"], "qwen3.7-flash")
            self.assertEqual(row["attempts"], 2)
            self.assertNotIn("error", row)
            self.assertEqual(row["routing_attempts"][0]["http_status"], 404)

    def test_fallback_after_invalid_json_keeps_primary_response(self):
        self.config["fallback_model"] = "fallback-vision"
        def call(url, key, payload, timeout, retries):
            response = envelope()
            if payload["model"] == self.config["model"]:
                response["choices"][0]["message"]["content"] = "not JSON"
            return response, 1
        self.run_pipeline(call=call)
        row = json.loads((self.run_dir / "predictions/nutrition5k.jsonl").read_text().splitlines()[0])
        self.assertEqual(row["model_route"], "fallback")
        self.assertEqual(row["routing_attempts"][0]["error"], "invalid_model_output")
        self.assertTrue((self.run_dir / row["routing_attempts"][0]["response_path"]).exists())
        self.assertTrue((self.run_dir / row["response_path"]).exists())

    def test_valid_uncertain_primary_does_not_trigger_fallback(self):
        self.config["fallback_model"] = "fallback-vision"
        call = MagicMock(return_value=(envelope(), 1))
        reports = self.run_pipeline(call=call)
        self.assertEqual(call.call_count, 4)
        self.assertEqual(reports["nutrition5k"]["routing"]["fallback_final_count"], 0)

    def test_auth_error_with_same_key_does_not_trigger_fallback(self):
        self.config["fallback_model"] = "fallback-vision"
        call = MagicMock(side_effect=ProviderError("http_error", 401))
        reports = self.run_pipeline(call=call)
        call.assert_called_once()
        self.assertEqual(reports["nutrition5k"]["routing"]["fallback_final_count"], 0)

    def test_both_routes_failing_count_as_error_and_resume_rejects_changed_fallback(self):
        self.config["fallback_model"] = "fallback-vision"
        call = MagicMock(side_effect=ProviderError("network_error", attempts=3))
        reports = self.run_pipeline(call=call)
        self.assertEqual(call.call_count, 8)
        self.assertEqual(reports["lefood-set"]["error_response_count"], 2)
        row = json.loads((self.run_dir / "predictions/lefood-set.jsonl").read_text().splitlines()[0])
        self.assertEqual(row["attempts"], 6)
        self.config["fallback_model"] = "different-fallback"
        with self.assertRaises(ValueError):
            self.run_pipeline(resume=True, call=MagicMock())

    def test_preflight_detects_corruption_and_path_escape(self):
        path = self.root / "manifests" / "nutrition5k-50.jsonl"
        self.assertEqual(len(validate_samples(self.root, path)), 2)
        (self.root / "image.png").write_bytes(b"corrupt")
        with self.assertRaises(ValueError):
            validate_samples(self.root, path)
        rows = copy.deepcopy(self.references["nutrition5k"])
        rows[0]["image_path"] = "../outside.png"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        with self.assertRaises(ValueError):
            validate_samples(self.root, path)


if __name__ == "__main__":
    unittest.main()

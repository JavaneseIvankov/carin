#!/usr/bin/env python3
"""Run locked image subsets against an Alibaba OpenAI-compatible vision API."""

import argparse
import base64
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import platform
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from download_datasets import METRICS, ROOT, save_bytes
from evaluate_predictions import measurement, read_jsonl, score

PROMPT_PATH = ROOT / "prompts" / "food-estimation-v1.txt"
DATASETS = ("nutrition5k", "lefood-set")


class ProviderError(Exception):
    def __init__(self, code, status=None, attempts=1):
        self.code, self.status, self.attempts = code, status, attempts
        super().__init__(code)


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, new_url):
        return None  # Never forward an API credential to another endpoint.


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def load_env(path):
    """Small KEY=value loader; no interpolation, execution, or key logging."""
    if not path.exists():
        return
    for index, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"Invalid environment-file line {index}")
        key, value = (part.strip() for part in line.split("=", 1))
        if not key.isidentifier():
            raise ValueError(f"Invalid environment-file key on line {index}")
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"Unclosed environment-file quote on line {index}")
            value = value[1:-1]
        os.environ.setdefault(key, value)


def env_bool(name, default):
    text = os.environ.get(name, str(default)).casefold()
    if text not in ("true", "false"):
        raise ValueError(f"{name} must be true or false")
    return text == "true"


def validate_base_url(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or "YOUR_" in url or "{" in url or "}" in url):
        raise ValueError("VLM_BASE_URL must be the actual HTTPS compatible-mode base URL")
    if not parsed.path.rstrip("/").endswith("/v1"):
        raise ValueError("VLM_BASE_URL must end in /v1, without /chat/completions")
    return url.rstrip("/")


def validate_samples(root, manifest_path, limit=None):
    records = read_jsonl(manifest_path)
    if not records or len({row["sample_id"] for row in records}) != len(records):
        raise ValueError("Manifest has no samples or duplicate IDs")
    if len({row["dataset"] for row in records}) != 1:
        raise ValueError("A manifest must contain exactly one dataset")
    if limit is not None:
        if limit < 1 or limit > len(records):
            raise ValueError(f"limit must be between 1 and {len(records)}")
        records = records[:limit]
    score(records, [])  # Validate all reference values before a paid request.
    for row in records:
        path = (root / row["image_path"]).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError("Image path escapes the experiment directory")
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != row["image_sha256"]:
            raise ValueError(f"Image checksum mismatch: {row['sample_id']}")
        if len(content) != row["image_bytes"]:
            raise ValueError(f"Image byte-count mismatch: {row['sample_id']}")
        image_mime(content)
    return records


def image_mime(content):
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    raise ValueError("Expected an original PNG or JPEG")


def limit_total_samples(references, total):
    if total < len(references) or total > sum(len(rows) for rows in references.values()):
        raise ValueError("total-limit must cover every selected dataset and not exceed available samples")
    counts = dict.fromkeys(references, 0)
    while sum(counts.values()) < total:
        for dataset, rows in references.items():
            if counts[dataset] < len(rows):
                counts[dataset] += 1
                if sum(counts.values()) == total:
                    break
    return {dataset: rows[:counts[dataset]] for dataset, rows in references.items()}


def make_payload(model, image, prompt, max_tokens, json_mode, thinking):
    # Reference labels, names, IDs, dataset identity and image filenames are
    # deliberately absent from the provider request.
    image_url = f"data:{image_mime(image)};base64," + base64.b64encode(image).decode("ascii")
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": image_url}},
            {"type": "text", "text": prompt},
        ]}],
        "temperature": 0, "max_tokens": max_tokens,
        "stream": False, "enable_thinking": thinking,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    return payload


def validate_vision_model(model):
    if model == "deepseek-v4-flash-0731":
        raise ValueError("deepseek-v4-flash-0731 accepts text only on Alibaba; select an image-capable fallback")


def provider_call(base_url, key, payload, timeout, retries):
    opener = urllib.request.build_opener(NoRedirects())
    for attempt in range(retries + 1):
        request = urllib.request.Request(
            base_url + "/chat/completions", method="POST",
            data=json.dumps(payload, allow_nan=False).encode(),
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        )
        try:
            with opener.open(request, timeout=timeout) as response:
                data = response.read()
            try:
                envelope = json.loads(data)
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise ProviderError("invalid_provider_json", attempts=attempt + 1) from None
            if not isinstance(envelope, dict):
                raise ProviderError("invalid_provider_envelope", attempts=attempt + 1)
            return envelope, attempt + 1
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            # Do not retain/log HTTP bodies: provider errors can echo credentials.
            failure = ProviderError("http_error", status, attempt + 1)
            if status not in (429, 500, 502, 503, 504) or attempt == retries:
                raise failure from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            failure = ProviderError("network_error", attempts=attempt + 1)
            if attempt == retries:
                raise failure from None
        time.sleep(min(2 ** attempt, 8))


def parse_model_response(envelope):
    try:
        choice = envelope["choices"][0]
        if not isinstance(choice, dict):
            raise ValueError("Expected a completion choice object")
        if choice.get("finish_reason") != "stop":
            raise ValueError("Response did not finish normally")
        content = choice["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("Expected text content")
        result = json.loads(content)
        if not isinstance(result, dict) or set(result) != {"is_food", "components", "prediction", "limitations"}:
            raise ValueError("Unexpected model output keys")
        if not isinstance(result["is_food"], bool):
            raise ValueError("is_food must be boolean")
        values = result["prediction"]
        if not isinstance(values, dict) or set(values) != set(METRICS):
            raise ValueError("Model output must contain all five measurements")
        for value in values.values():
            measurement(value)
        components = result["components"]
        if not isinstance(components, list):
            raise ValueError("components must be an array")
        for component in components:
            if not isinstance(component, dict) or set(component) != {"name", "mass_g"}:
                raise ValueError("Invalid component fields")
            if not isinstance(component["name"], str) or not component["name"].strip():
                raise ValueError("Invalid component name")
            measurement(component["mass_g"])
        if not isinstance(result["limitations"], list) or any(not isinstance(value, str) for value in result["limitations"]):
            raise ValueError("limitations must be strings")
        if not result["is_food"] and (components or any(value is not None for value in values.values())):
            raise ValueError("Nonfood output must have no numeric estimates")
        return result
    except (KeyError, IndexError, TypeError, ValueError):
        raise ProviderError("invalid_model_output") from None


def redact(value, key):
    if isinstance(value, str):
        return value.replace(key, "[REDACTED]") if key else value
    if isinstance(value, list):
        return [redact(item, key) for item in value]
    if isinstance(value, dict):
        return {name: redact(item, key) for name, item in value.items()}
    return value


def write_predictions(path, rows):
    content = "".join(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n" for row in rows)
    save_bytes(path, content.encode())


def infer_sample(run_dir, dataset, row, config, prompt, key, call):
    recorded = {"sample_id": row["sample_id"], "image_sha256": row["image_sha256"],
                "recorded_at": utc_now(), "attempts": 0, "routing_attempts": []}
    routes = [("primary", config["model"])]
    if config.get("fallback_model"):
        routes.append(("fallback", config["fallback_model"]))
    image = row["image_bytes_for_request"]
    started = time.perf_counter()
    fatal = False
    for route, model in routes:
        attempt = {"route": route, "requested_model": model, "attempts": 0}
        recorded.update(model_route=route, requested_model=model, fallback_used=route == "fallback")
        try:
            payload = make_payload(model, image, prompt, config["max_tokens"],
                                   config["json_mode"], config["enable_thinking"])
            envelope, tries = call(config["base_url"], key, payload,
                                   config["timeout_seconds"], config["max_retries"])
            attempt["attempts"] = tries
            response_path = f"responses/{dataset}-{row['sample_id']}-{route}.json"
            save_bytes(run_dir / response_path, json_bytes(redact(envelope, key)))
            attempt["response_path"] = response_path
            metadata = {"provider_" + name: redact(envelope.get(name), key)
                        for name in ("model", "id", "system_fingerprint")}
            usage = envelope.get("usage")
            if isinstance(usage, dict):
                metadata["usage"] = {name: value for name, value in usage.items()
                                     if name in ("prompt_tokens", "completion_tokens", "total_tokens")
                                     and isinstance(value, int) and not isinstance(value, bool) and value >= 0}
            attempt.update(metadata)
            result = parse_model_response(envelope)
            attempt["status"] = "ok"
            recorded.pop("error", None)
            recorded.pop("http_status", None)
            recorded.update(status="ok", response_path=response_path, **metadata, **redact(result, key))
            recorded["routing_attempts"].append(attempt)
            break
        except ProviderError as error:
            attempt.update(status="error", error=error.code, http_status=error.status,
                           attempts=max(attempt["attempts"], error.attempts))
            recorded["routing_attempts"].append(attempt)
            recorded.update(status="error", error=error.code, http_status=error.status)
            fatal = error.status in (400, 401, 403, 404)
            if error.status in (401, 403):
                break  # Same credential/endpoint: changing model cannot fix auth.
            if route == "primary" and len(routes) == 2:
                fatal = False
    recorded["attempts"] = sum(attempt["attempts"] for attempt in recorded["routing_attempts"])
    recorded["elapsed_seconds"] = time.perf_counter() - started
    return recorded, fatal


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)]


def write_report(run_dir, dataset, references, predictions):
    report = score(references, predictions)
    times = [row["elapsed_seconds"] for row in predictions if "elapsed_seconds" in row]
    report["latency"] = {
        "scope": "client wall time per sample including retries/backoff; not GPU inference time",
        "sample_count": len(times), "median_seconds": statistics.median(times) if times else None,
        "p95_seconds": percentile(times, .95),
    }
    for status in ("ok", "error"):
        status_times = [row["elapsed_seconds"] for row in predictions
                        if row["status"] == status and "elapsed_seconds" in row]
        report["latency"][status] = {
            "sample_count": len(status_times),
            "median_seconds": statistics.median(status_times) if status_times else None,
            "p95_seconds": percentile(status_times, .95),
        }
    report["token_usage"] = {
        "scope": "final retained response only; tokens/charges for failed or replaced attempts are unknown",
        "response_count_with_usage": sum(isinstance(row.get("usage"), dict) for row in predictions),
        "totals": {name: sum(row.get("usage", {}).get(name, 0) for row in predictions)
                   for name in ("prompt_tokens", "completion_tokens", "total_tokens")},
    }
    models = sorted({row["requested_model"] for row in predictions if "requested_model" in row})
    report["routing"] = {
        "primary_final_count": sum(row.get("model_route") == "primary" for row in predictions),
        "fallback_final_count": sum(row.get("model_route") == "fallback" for row in predictions),
        "primary_failure_count": sum(attempt.get("route") == "primary" and attempt.get("status") == "error"
                                     for row in predictions for attempt in row.get("routing_attempts", [])),
        "limitation": "Overall metrics evaluate the routing policy; final model subsets are not matched independent benchmarks",
    }
    report["per_final_model"] = {}
    for model in models:
        model_predictions = [row for row in predictions if row.get("requested_model") == model]
        ids = {row["sample_id"] for row in model_predictions}
        report["per_final_model"][model] = score([row for row in references if row["sample_id"] in ids], model_predictions)
    save_bytes(run_dir / "reports" / f"{dataset}.json", json_bytes(report))
    return report


def run_pipeline(root, run_dir, references, config, prompt, key, *, dry_run=False,
                 resume=False, retry_errors=False, call=provider_call):
    identity = {
        "provider": "alibaba-openai-compatible", "configuration": config,
        "fallback_policy": "after exhausted provider retries or invalid output; not for auth errors or uncertain valid estimates",
        "prompt": prompt, "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
        "image_preprocessing": "original_bytes; no resizing; base64 PNG/JPEG",
        "datasets": {name: {
            "manifest_sha256": hashlib.sha256((root / "manifests" / f"{name}-50.jsonl").read_bytes()).hexdigest(),
            "samples": [{"sample_id": row["sample_id"], "image_sha256": row["image_sha256"]} for row in rows],
        } for name, rows in references.items()},
    }
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    if run_dir.exists() and not resume:
        raise ValueError("Run directory already exists; use --resume or a new --run-dir")
    if resume:
        metadata = json.loads((run_dir / "run.json").read_text())
        if metadata["fingerprint"] != fingerprint or metadata["mode"] != "live":
            raise ValueError("Resume configuration/samples differ, or run was dry-run; create a new run directory")
    else:
        run_dir.mkdir(parents=True)
        save_bytes(run_dir / "run.json", json_bytes({
            "mode": "dry_run" if dry_run else "live", "created_at": utc_now(),
            "fingerprint": fingerprint, "identity": identity,
            "runtime": {"python": platform.python_version(), "platform": platform.platform()},
        }))
    if dry_run:
        print(json.dumps({"mode": "dry_run", "network_requests": 0,
                          "planned_samples": {name: len(rows) for name, rows in references.items()},
                          "run_dir": str(run_dir)}, indent=2))
        return {}

    lock = run_dir / ".running"
    try:
        with lock.open("x") as handle:
            handle.write(str(os.getpid()))
    except FileExistsError:
        raise ValueError("Run is already locked; confirm previous process stopped before removing .running") from None
    reports = {}
    fatal = False
    try:
        for dataset, rows in references.items():
            path = run_dir / "predictions" / f"{dataset}.jsonl"
            predictions = read_jsonl(path) if path.exists() else []
            score(rows, predictions)  # Validate existing IDs and values before any request.
            previous = {row["sample_id"]: row for row in predictions}
            for row in rows:
                old = previous.get(row["sample_id"])
                if fatal or (old and (old["status"] == "ok" or not retry_errors)):
                    continue
                request_row = dict(row, image_bytes_for_request=(root / row["image_path"]).read_bytes())
                recorded, fatal = infer_sample(run_dir, dataset, request_row, config, prompt, key, call)
                previous[row["sample_id"]] = recorded
                predictions = [previous[item["sample_id"]] for item in rows if item["sample_id"] in previous]
                write_predictions(path, predictions)
                print(f"{dataset} {row['sample_id']}: {recorded['status']} via {recorded['model_route']} "
                      f"({recorded['elapsed_seconds']:.2f}s)", flush=True)
            reports[dataset] = write_report(run_dir, dataset, rows, predictions)
        save_bytes(run_dir / "summary.json", json_bytes({"mode": "live", "fingerprint": fingerprint,
                   "updated_at": utc_now(), "stopped_on_configuration_error": fatal, "datasets": reports}))
        table = io.StringIO()
        writer = csv.writer(table)
        writer.writerow(["dataset", "model_scope", "model", "metric", "reference_count", "valid_prediction_count", "coverage", "mae", "mean_signed_error"])
        for dataset, report in reports.items():
            scopes = [("routing_policy", "", report)] + [("final_model_subset", model, model_report)
                      for model, model_report in report["per_final_model"].items()]
            for scope, model, model_report in scopes:
                for metric, values in model_report["metrics"].items():
                    writer.writerow([dataset, scope, model, metric] + [values[name] if values[name] is not None else ""
                        for name in ("reference_count", "valid_prediction_count", "coverage", "mae", "mean_signed_error")])
        save_bytes(run_dir / "summary.csv", table.getvalue().encode())
        return reports
    finally:
        lock.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--dataset", choices=("all",) + DATASETS, default="all")
    limits = parser.add_mutually_exclusive_group()
    limits.add_argument("--limit", type=int, help="Smoke-test samples per dataset; omit for all 50")
    limits.add_argument("--total-limit", type=int, help="Total samples across datasets, allocated round-robin")
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="Validate local inputs; do not call API or create scores")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--retry-errors", action="store_true", help="With --resume, retry previously failed samples")
    args = parser.parse_args(argv)
    try:
        load_env(args.env_file)
        key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
        base_url = os.environ.get("VLM_BASE_URL", "").strip()
        model = os.environ.get("VLM_MODEL", "").strip()
        fallback_model = os.environ.get("VLM_FALLBACK_MODEL", "").strip() or None
        validate_vision_model(model)
        if fallback_model:
            validate_vision_model(fallback_model)
            if fallback_model == model:
                raise ValueError("Fallback must differ from the primary model")
        if not args.dry_run:
            if not key or not model:
                raise ValueError("Set DASHSCOPE_API_KEY and VLM_MODEL in the environment or ignored .env file")
            base_url = validate_base_url(base_url)
        thinking = env_bool("VLM_ENABLE_THINKING", False)
        json_mode = env_bool("VLM_JSON_MODE", True)
        if thinking and json_mode:
            raise ValueError("JSON mode requires VLM_ENABLE_THINKING=false; select a non-thinking model")
        config = {"base_url": base_url or None, "model": model or None, "fallback_model": fallback_model,
                  "enable_thinking": thinking, "json_mode": json_mode,
                  "timeout_seconds": float(os.environ.get("VLM_TIMEOUT_SECONDS", "120")),
                  "max_retries": int(os.environ.get("VLM_MAX_RETRIES", "2")),
                  "max_tokens": int(os.environ.get("VLM_MAX_TOKENS", "1024"))}
        if (not math.isfinite(config["timeout_seconds"]) or config["timeout_seconds"] <= 0
                or not 0 <= config["max_retries"] <= 5 or config["max_tokens"] < 1):
            raise ValueError("Invalid timeout/retry/token configuration")
        if args.retry_errors and not args.resume or args.dry_run and args.resume:
            raise ValueError("--retry-errors requires --resume; --dry-run cannot resume a live run")
        if args.resume and args.run_dir is None:
            raise ValueError("--resume requires --run-dir")
        datasets = DATASETS if args.dataset == "all" else (args.dataset,)
        references = {name: validate_samples(ROOT, ROOT / "manifests" / f"{name}-50.jsonl", args.limit)
                      for name in datasets}
        if args.total_limit is not None:
            references = limit_total_samples(references, args.total_limit)
        run_dir = args.run_dir or ROOT / "results" / datetime.now(timezone.utc).strftime("run-%Y%m%dT%H%M%S%fZ")
        reports = run_pipeline(ROOT, run_dir.resolve(), references, config, PROMPT_PATH.read_text(), key,
                               dry_run=args.dry_run, resume=args.resume, retry_errors=args.retry_errors)
        print(f"Run saved: {run_dir.resolve()}")
        if any(report["error_response_count"] or report["missing_response_count"] for report in reports.values()):
            return 1
        return 0
    except (ValueError, OSError, KeyError) as error:
        print(f"Evaluation setup failed: {redact(str(error), os.environ.get('DASHSCOPE_API_KEY', ''))}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

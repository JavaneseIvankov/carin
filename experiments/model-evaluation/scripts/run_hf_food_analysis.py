#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["huggingface-hub==1.33.0"]
# ///
"""Test Ateeqq/food-analysis via hf-inference on locked LeFood-Set images."""

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import statistics
import time

from huggingface_hub import HfApi, InferenceClient, get_token
import huggingface_hub

from download_datasets import ROOT, save_bytes
from evaluate_predictions import measurement, score
from run_evaluation import (
    json_bytes, load_env, make_payload, redact, utc_now, validate_samples,
    write_predictions,
)

MODEL = "Ateeqq/food-analysis"
PROVIDER = "hf-inference"
PROMPT_PATH = ROOT / "prompts" / "food-analysis-hf-v1.txt"


def parse_food_analysis(content):
    """Convert the model-card schema to the existing scorer; no unit guessing."""
    result = json.loads(content)
    fields = {"dish_name", "food_type", "cooking_method", "nutritional_summary", "portion_size"}
    if not isinstance(result, dict) or set(result) != fields:
        raise ValueError("Unexpected food-analysis output fields")
    if not isinstance(result["dish_name"], str) or not result["dish_name"].strip():
        raise ValueError("Missing dish name")
    for field in ("food_type", "cooking_method"):
        if result[field] is not None and not isinstance(result[field], str):
            raise ValueError("Invalid food description")
    nutrients = result["nutritional_summary"]
    if not isinstance(nutrients, dict) or set(nutrients) != {
        "calories_kcal", "protein_g", "carbohydrate_g", "fat_g",
    }:
        raise ValueError("Unexpected nutrient fields")
    for value in nutrients.values():
        measurement(value)
    portions = result["portion_size"]
    if not isinstance(portions, dict) or any(
        not isinstance(name, str) or not name.strip() for name in portions
    ):
        raise ValueError("Invalid portion fields")
    masses = [measurement(value) for value in portions.values()]
    mass = sum(masses) if masses and all(value is not None for value in masses) else None
    measurement(mass)  # Reject overflow; do not score a known subtotal as total mass.
    return result, {
        "mass_g": mass,
        "energy_kcal": nutrients["calories_kcal"],
        "protein_g": nutrients["protein_g"],
        "carbohydrate_g": nutrients["carbohydrate_g"],
        "fat_g": nutrients["fat_g"],
    }


def run_smoke(references, run_dir, prompt, hf_token, dry_run=False, probe_unlisted=False):
    run_dir.mkdir(parents=True, exist_ok=False)
    metadata = {
        "mode": "dry-run" if dry_run else "live",
        "created_at": utc_now(), "model": MODEL, "provider": PROVIDER,
        "huggingface_hub_version": huggingface_hub.__version__,
        "prompt": prompt, "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
        "temperature": 0, "max_tokens": 1024,
        "probe_unlisted": probe_unlisted,
        "samples": [{"sample_id": row["sample_id"], "image_sha256": row["image_sha256"]}
                    for row in references],
    }

    def save(name, value):
        save_bytes(run_dir / name, json_bytes(redact(value, hf_token)))

    save("run.json", metadata)
    if dry_run:
        save("summary.json", {"status": "dry-run", "planned_count": len(references),
                              "attempted_count": 0})
        print(f"Dry-run: {len(references)} verified LeFood images; no network calls. {run_dir}")
        return 0

    try:
        info = HfApi(token=hf_token or False).model_info(
            MODEL, expand=["inferenceProviderMapping", "sha"], timeout=20,
        )
        metadata["model_revision_at_preflight"] = info.sha
        mapping = info.inference_provider_mapping or []
        metadata["provider_mapping"] = [asdict(item) for item in mapping]
        available = any(item.provider == PROVIDER and item.status == "live" for item in mapping)
    except Exception as error:
        save("summary.json", {"status": "blocked", "attempted_count": 0,
                              "blockers": ["provider_preflight_failed"],
                              "error_type": type(error).__name__})
        print(f"Provider preflight failed ({type(error).__name__}); no images submitted. {run_dir}")
        return 2
    blockers = []
    if not available and not probe_unlisted:
        blockers.append("model_not_served_by_hf_inference")
    if not hf_token:
        blockers.append("missing_hf_token")
    save("run.json", metadata)
    if blockers:
        save("summary.json", {"status": "blocked", "planned_count": len(references),
                              "attempted_count": 0, "blockers": blockers})
        print(f"Blocked: {', '.join(blockers)}. No images submitted; no MAE. {run_dir}")
        return 2

    # Same explicit provider/token initialization requested for this experiment.
    client = InferenceClient(provider="hf-inference", token=hf_token, timeout=120)
    rows = []
    for reference in references:
        row = {"sample_id": reference["sample_id"], "image_sha256": reference["image_sha256"],
               "recorded_at": utc_now(), "requested_model": MODEL, "provider": PROVIDER,
               "reference_food_name": reference["food_name"],
               "reference_mass_g": reference["reference"]["mass_g"]}
        started = time.perf_counter()
        status_code = None
        try:
            image = (ROOT / reference["image_path"]).read_bytes()
            # Only image bytes and a fixed prompt enter the provider request.
            messages = make_payload(MODEL, image, prompt, 1024, False, False)["messages"]
            response = client.chat_completion(
                model=MODEL, messages=messages, max_tokens=1024, temperature=0,
            )
            envelope = asdict(response)
            save(f"responses/{row['sample_id']}.json", envelope)
            choice = envelope["choices"][0]
            if choice["finish_reason"] != "stop":
                raise ValueError("Incomplete model output")
            observation, prediction = parse_food_analysis(choice["message"]["content"])
            row.update(status="ok", observation=observation, prediction=prediction,
                       provider_model=envelope.get("model"), usage=envelope.get("usage"))
        except Exception as error:
            status_code = getattr(getattr(error, "response", None), "status_code", None)
            # Do not log exception text or HTTP bodies that could echo credentials.
            row.update(status="error", error_type=type(error).__name__, http_status=status_code)
        row["elapsed_seconds"] = time.perf_counter() - started
        rows.append(redact(row, hf_token))
        write_predictions(run_dir / "predictions" / "lefood-set.jsonl", rows)
        print(f"{row['sample_id']}: {row['status']} ({row['elapsed_seconds']:.2f}s)")
        if status_code in (401, 403, 404) or (probe_unlisted and not available):
            # A diagnostic probe of an unlisted model makes at most one attempt.
            break

    report = score(references, rows)
    save("report.json", report)
    failed = bool(report["error_response_count"] or report["missing_response_count"])
    save("summary.json", {
        "status": "failed" if failed else "completed", "model": MODEL, "provider": PROVIDER,
        "probe_unlisted": probe_unlisted,
        "report": report, "median_client_seconds": statistics.median(
            row["elapsed_seconds"] for row in rows
        ),
        "limitations": [
            "LeFood has no calorie/macro ground truth; nutrient MAE stays null.",
            "Native output uses a different prompt from Qwen baseline; this is not a controlled comparison.",
            "Source food names and dish_name are retained for manual recognition review; no F1 is invented.",
            "Nutrients are experimental model estimates, not approved sourced production nutrition.",
            "Hub revision at preflight does not prove the revision deployed by the provider.",
        ],
    })
    print(f"Run saved: {run_dir}")
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--probe-unlisted", action="store_true",
                        help="With a token, attempt at most one image even if provider mapping is empty")
    args = parser.parse_args()
    try:
        load_env(args.env_file)
        references = validate_samples(ROOT, ROOT / "manifests" / "lefood-set-50.jsonl", args.limit)
        run_dir = args.run_dir or ROOT / "results" / (
            "hf-food-analysis-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        )
        return run_smoke(references, run_dir, PROMPT_PATH.read_text(),
                         os.environ.get("HF_TOKEN") or get_token(), args.dry_run, args.probe_unlisted)
    except (ValueError, OSError) as error:
        print(f"Local setup failed ({type(error).__name__}); check inputs and use a fresh run directory.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

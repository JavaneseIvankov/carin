#!/usr/bin/env python3
"""Paired A1V1 smoke benchmark on three Indonesian LeFood-Set images."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics

from compare_qwen37_variants import aggregate_metrics
from download_datasets import ROOT, METRICS, save_bytes
from evaluate_predictions import read_jsonl
from run_a1v1_benchmark25 import MAX, MODELS, PROMPT, SCHEMA, make_call, response_format
from run_evaluation import json_bytes, load_env, run_pipeline, utc_now, validate_samples

SAMPLE_IDS = ("lefood-231", "lefood-251", "lefood-466")
FOOD_LABELS = {
    "lefood-231": "Ayam Bumbu Srundeng",
    "lefood-251": "Rendang ayam",
    "lefood-466": "Tempe bumbu bacem",
}
DEFAULT_RUN = ROOT / "results/indonesian-a1v1-3-2026-10-14"
BASELINE = ROOT / "results/smoke-5-2026-10-14"


def select_samples():
    manifest = ROOT / "manifests/lefood-set-50.jsonl"
    records = validate_samples(ROOT, manifest)
    by_id = {row["sample_id"]: row for row in records}
    selected = []
    for sample_id in SAMPLE_IDS:
        row = by_id.get(sample_id)
        if row is None or row["food_name"] != FOOD_LABELS[sample_id]:
            raise ValueError(f"Locked LeFood selection changed: {sample_id}")
        selected.append(row)
    return selected


def summarize(run_dir, selected):
    refs = {("lefood-set", row["sample_id"]): row for row in selected}
    rows = []
    all_predictions = {}
    for model in MODELS:
        directory = run_dir / model
        pred_path = directory / "predictions/lefood-set.jsonl"
        predictions = {("lefood-set", row["sample_id"]): row for row in read_jsonl(pred_path)}
        all_predictions[model] = predictions
        metrics = aggregate_metrics(refs, predictions)
        raw_rows = []
        token_totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        for sample in selected:
            sample_id = sample["sample_id"]
            pred = predictions.get(("lefood-set", sample_id), {})
            raw_path = directory / f"raw/{sample_id}.json"
            raw = json.loads(raw_path.read_text()) if raw_path.exists() else {}
            usage = raw.get("usage", {})
            for name in token_totals:
                token_totals[name] += usage.get(name, 0)
            raw_content = raw.get("choices", [{}])[0].get("message", {}).get("content")
            native = json.loads(raw_content) if isinstance(raw_content, str) else {}
            request_path = directory / f"requests/{sample_id}.json"
            request = json.loads(request_path.read_text()) if request_path.exists() else {}
            predicted_mass = pred.get("prediction", {}).get("mass_g")
            target_mass = sample["reference"]["mass_g"]
            components = pred.get("components", [])
            raw_rows.append({
                "sample_id": sample_id,
                "food_name_ground_truth": sample["food_name"],
                "ground_truth_mass_g": target_mass,
                "predicted_components": components,
                "predicted_mass_g": predicted_mass,
                "absolute_mass_error_g": abs(predicted_mass - target_mass) if isinstance(predicted_mass, (int, float)) else None,
                "prediction_status": pred.get("status", "missing"),
                "is_food": native.get("is_food"),
                "container_diameter_cm": native.get("container_diameter_cm"),
                "apparent_volume_cm3": native.get("apparent_volume_cm3"),
                "limitations": native.get("limitations", []),
                "latency_seconds": pred.get("elapsed_seconds"),
                "attempts": pred.get("attempts"),
                "provider_model": raw.get("model"),
                "finish_reason": raw.get("choices", [{}])[0].get("finish_reason"),
                "tokens": usage,
                "request_controls": request.get("settings", {}),
            })
        valid = [row for row in raw_rows if row["prediction_status"] == "ok"]
        times = [row["latency_seconds"] for row in raw_rows if row["latency_seconds"] is not None]
        rows.append({
            "model": model,
            "sample_count": len(selected),
            "valid_count": len(valid),
            "error_count": len(selected) - len(valid),
            "mass_mae_g": metrics["mass_g"],
            "mean_latency_seconds": statistics.mean(times) if times else None,
            "median_latency_seconds": statistics.median(times) if times else None,
            "token_totals": token_totals,
            "samples": raw_rows,
        })
    comparison = {
        "benchmark": "paired Indonesian food smoke test, A1V1-schema-v2",
        "created_at": utc_now(),
        "selection": [{"sample_id": row["sample_id"], "food_name": row["food_name"],
                       "image_sha256": row["image_sha256"], "ground_truth_mass_g": row["reference"]["mass_g"]}
                      for row in selected],
        "models": rows,
        "limitations": [
            "Only three LeFood-Set images; exploratory smoke test, not an independent or statistically stable evaluation.",
            "LeFood-Set has ground-truth portion mass for these images but no ground-truth nutrient values; nutrient MAE is unavailable.",
            "Latency is API client wall time and excludes mobile upload, VPS queue, database, and polling.",
        ],
    }
    save_bytes(run_dir / "comparison.json", json_bytes(comparison))
    fmt = lambda value: "NA" if value is None else f"{value:.2f}"
    report = [
        "# Benchmark A1V1 untuk tiga makanan Indonesia — 14 Oktober 2026", "",
        "Benchmark berpasangan: kedua model menerima foto yang sama dengan prompt A1V1-schema-v2, JSON Schema strict, temperature=0, thinking=false, max_tokens=1024, endpoint Alibaba Singapore, dan tanpa fallback.",
        "Sampel dipilih dari manifest LeFood-Set yang terkunci dan tidak termasuk 25 sampel benchmark sebelumnya: Ayam Bumbu Srundeng, Rendang ayam, dan Tempe bumbu bacem. Nama/GT tidak dikirim ke model.",
        "LeFood-Set menyediakan ground truth massa, tetapi tidak menyediakan ground truth nutrisi. Karena itu MAE nutrisi tidak dihitung dan nilai nutrisi dari model tidak dianggap terverifikasi.", "",
        "## Hasil", "",
        "| Model | Mass MAE (g) | Pasangan valid | Mean latency (s) | Median latency (s) | Total tokens |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in rows:
        report.append("| {} | {} ({}/{}) | {}/{} | {} | {} | {} |".format(
            row["model"], fmt(row["mass_mae_g"]["mae"]), row["mass_mae_g"]["pairs"], row["mass_mae_g"]["expected_pairs"],
            row["valid_count"], row["sample_count"], fmt(row["mean_latency_seconds"]), fmt(row["median_latency_seconds"]),
            row["token_totals"]["total_tokens"]))
    report += ["", "## Per sampel", "", "| Model | Makanan (GT) | Prediksi komponen | GT massa (g) | Prediksi massa (g) | Error absolut (g) | Status | Latency (s) |",
               "| --- | --- | --- | ---: | ---: | ---: | --- | ---: |"]
    for row in rows:
        for sample in row["samples"]:
            names = ", ".join(item.get("name", "") for item in sample["predicted_components"])
            report.append("| {} | {} | {} | {} | {} | {} | {} | {} |".format(
                row["model"], sample["food_name_ground_truth"], names or "NA", fmt(sample["ground_truth_mass_g"]),
                fmt(sample["predicted_mass_g"]), fmt(sample["absolute_mass_error_g"]), sample["prediction_status"],
                fmt(sample["latency_seconds"])))
    report += ["", "Hasil ditampilkan sesuai output model; tidak ada koreksi label atau berat setelah inference. `is_food`, geometri visual, limits, provider model, finish reason, token per respons, SHA gambar, serta payload kontrol tersimpan di JSONL/raw/details/request artifacts.",
               "MAE dihitung hanya dari prediksi massa yang valid. Latency mencakup request API dan validasi/penyimpanan lokal, bukan waktu inference provider murni. Token adalah token yang dilaporkan provider.",
               "Tiga foto ini terlalu sedikit untuk menyimpulkan model terbaik secara umum. Ini hanya smoke test makanan Indonesia dan tidak mengukur ketepatan kalori/makro.", "",
               "## Detail output", "",
               "Per-sampel `comparison.json` dan seluruh raw response, request, prediction, serta metadata ada di folder hasil benchmark.", ""]
    text = "\n".join(report)
    save_bytes(run_dir / "REPORT.md", text.encode())
    save_bytes(ROOT / "docs/INDONESIAN_A1V1_SMOKE_2026-10-14.md", text.encode())
    print(json.dumps([{"model": row["model"], "valid": row["valid_count"], "mass_mae_g": row["mass_mae_g"]["mae"],
                       "mean_latency_seconds": row["mean_latency_seconds"], "tokens": row["token_totals"]["total_tokens"]}
                      for row in rows], indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    selected = select_samples()
    if args.report_only:
        summarize(args.run_dir, selected)
        return 0
    load_env(ROOT / ".env")
    key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not key:
        raise ValueError("Missing local provider credential")
    prompt = PROMPT.read_text()
    baseline = json.loads((BASELINE / "run.json").read_text())["identity"]["configuration"]
    shared = {"base_url": baseline["base_url"], "fallback_model": None, "enable_thinking": False,
              "json_mode": True, "temperature": 0, "max_tokens": 1024, "timeout_seconds": 120,
              "max_retries": 2, "ablation_variant": "A1V1-schema-v2", "response_format": response_format(),
              "schema_sha256": hashlib.sha256(SCHEMA.read_bytes()).hexdigest()}
    args.run_dir.mkdir(parents=True, exist_ok=True)
    plan = {"variant": "A1V1-schema-v2", "models": list(MODELS), "sample_ids": list(SAMPLE_IDS),
            "samples": [{"sample_id": row["sample_id"], "image_sha256": row["image_sha256"]} for row in selected],
            "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(), "controls": shared,
            "selection": "three previously unseen rows from the locked LeFood-Set 50-sample manifest"}
    plan_path = args.run_dir / "study.json"
    if plan_path.exists():
        old = json.loads(plan_path.read_text())
        old.pop("created_at", None)
        if old != plan:
            raise ValueError("Locked benchmark plan changed; use a new output folder")
    else:
        save_bytes(plan_path, json_bytes({"created_at": utc_now(), **plan}))
    indexed = {row["image_sha256"]: row for row in selected}
    for model in MODELS:
        config = dict(shared, model=model)
        directory = args.run_dir / model
        run_pipeline(ROOT, directory, {"lefood-set": selected}, config, prompt, key,
                     resume=args.resume and directory.exists(), call=make_call(model, directory, indexed, key))
    summarize(args.run_dir, selected)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

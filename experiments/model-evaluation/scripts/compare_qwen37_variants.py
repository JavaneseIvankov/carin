"""Compare historical ablations and the CPU-client combo on fixed paired samples."""
import argparse
import json
from pathlib import Path
import statistics

from download_datasets import ROOT, METRICS, save_bytes
from evaluate_predictions import measurement, read_jsonl
from run_evaluation import json_bytes, validate_samples
from run_qwen37_ablation import BASELINE, COMBO, MODEL, VARIANTS, lefood_label


def aggregate_metrics(references, predictions):
    """Pool same-unit errors; normalize by mean GT only with full coverage."""
    result = {}
    for metric in METRICS:
        targets = [(key, r["reference"][metric]) for key, r in references.items()
                   if r["reference"].get(metric) is not None]
        errors = []
        for key, truth in targets:
            row = predictions.get(key, {})
            value = row.get("prediction", {}).get(metric) if row.get("status") == "ok" else None
            measurement(value)
            if value is not None:
                errors.append(abs(value - truth))
        mae = statistics.mean(errors) if errors else None
        mean_gt = statistics.mean(truth for key, truth in targets) if targets else None
        complete = len(errors) == len(targets) and bool(targets)
        result[metric] = {"mae": mae, "pairs": len(errors), "expected_pairs": len(targets),
                          "mean_reference": mean_gt, "complete": complete,
                          "normalized_mae_pct": 100 * mae / mean_gt if complete and mean_gt > 0 else None}
    normalized = [result[m]["normalized_mae_pct"] for m in METRICS]
    result["overall_normalized_mae_pct"] = statistics.mean(normalized) if all(v is not None for v in normalized) else None
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ablations", type=Path, default=ROOT / "results/qwen37-staged-ablation-2026-10-14")
    parser.add_argument("--combo", type=Path, default=ROOT / "results/qwen37-combo-2026-10-14")
    args = parser.parse_args()
    baseline = json.loads((BASELINE / "run.json").read_text())["identity"]
    references = {ds: validate_samples(ROOT, ROOT / f"manifests/{ds}-50.jsonl", len(meta["samples"]))
                  for ds, meta in baseline["datasets"].items()}
    expected = {(ds, r["sample_id"]):r for ds, rows in references.items() for r in rows}
    base_predictions = {(ds, r["sample_id"]):r for ds in references
                        for r in read_jsonl(BASELINE / f"predictions/{ds}.jsonl")}
    # The historical empty-plate response was nonfood before these comparisons.
    scored = {k:r for k,r in expected.items() if base_predictions[k]["is_food"]}
    sources = [("B0", BASELINE)] + [(v, args.ablations / v) for v in VARIANTS] + [(COMBO, args.combo / COMBO)]
    rows = []
    for variant, directory in sources:
        identity = json.loads((directory / "run.json").read_text())["identity"]
        config = identity["configuration"]
        assert config["model"] == MODEL and config["base_url"] == baseline["configuration"]["base_url"]
        assert config["enable_thinking"] is False and config["json_mode"] and config["max_tokens"] == 1024
        if variant == COMBO:
            historical_a6 = json.loads((args.ablations / "A6V1/run.json").read_text())["identity"]["configuration"]
            assert config["catalog_sha256"] == historical_a6["catalog_sha256"]
        preds = {(ds, r["sample_id"]):r for ds in references for r in read_jsonl(directory / f"predictions/{ds}.jsonl")}
        assert set(preds) == set(expected)
        tokens = {k:0 for k in ("prompt_tokens", "completion_tokens", "total_tokens", "image_tokens")}
        for key, row in preds.items():
            assert row["image_sha256"] == expected[key]["image_sha256"]
            assert row["attempts"] == 1 and not row["fallback_used"]
            raw_path = directory / row["response_path"] if variant == "B0" else directory / f'raw/{row["sample_id"]}.json'
            raw = json.loads(raw_path.read_text())
            assert raw["model"] == MODEL and raw["choices"][0]["finish_reason"] == "stop"
            if variant != "B0":
                request = json.loads((directory / f'requests/{row["sample_id"]}.json').read_text())
                for name,value in {"model":MODEL,"temperature":0,"enable_thinking":False,
                                   "max_tokens":1024,"response_format":{"type":"json_object"}}.items():
                    assert request["settings"][name] == value
                assert request["image_sha256"] == expected[key]["image_sha256"]
                assert config["fallback_model"] is None
            usage = raw["usage"]
            for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
                tokens[name] += usage[name]
            tokens["image_tokens"] += usage.get("prompt_tokens_details", {}).get("image_tokens", 0)
        times = [r["elapsed_seconds"] for r in preds.values()]
        good_times = [r["elapsed_seconds"] for r in preds.values() if r["status"] == "ok"]
        metrics = aggregate_metrics(scored, preds)
        per_dataset = {ds:aggregate_metrics({k:r for k,r in scored.items() if k[0] == ds}, preds) for ds in references}
        labels = [{"sample_id":r["sample_id"],"gt":r["food_name"],
                   "predicted":lefood_label(preds[("lefood-set", r["sample_id"])])} for r in references["lefood-set"]]
        rows.append({"variant":variant,"metrics":metrics,"per_dataset":per_dataset,"tokens":tokens,
                     "ok":len(good_times),"count":len(times),"mean_seconds":statistics.mean(times),
                     "mean_success_seconds":statistics.mean(good_times),"median_seconds":statistics.median(times),
                     "min_seconds":min(times),"max_seconds":max(times),"labels":labels})
    mass = sorted((r for r in rows if r["metrics"]["mass_g"]["complete"]), key=lambda r:r["metrics"]["mass_g"]["mae"])
    joint = sorted((r for r in rows if r["metrics"]["overall_normalized_mae_pct"] is not None),
                   key=lambda r:r["metrics"]["overall_normalized_mae_pct"])
    output = {"model":MODEL,"empty_plate_excluded_from_numeric_ranking":True,"rows":rows,
              "mass_ranking":[r["variant"] for r in mass],"normalized_ranking":[r["variant"] for r in joint],
              "normalization":"Equal mean of MAE(metric)/mean_ground_truth(metric)*100 over mass/energy/protein/carbs/fat; mass uses four food pairs, each nutrient two Nutrition5k food pairs."}
    save_bytes(args.combo / "comparison-all.json", json_bytes(output))
    def fmt(value): return "NA" if value is None else f"{value:.3f}"
    text = ["# A1V1 + A6V1: CPU-only client pilot — 2026-10-14", "",
            "New combo: five original B0 images, same snapshot/endpoint, temp=0, thinking=false, JSON mode, max_tokens=1024, no fallback/retry.",
            "Only stdlib code runs locally, with CUDA_VISIBLE_DEVICES empty. Qwen inference is hosted in Alibaba; this is not a local CPU VLM or a VPS/mobile end-to-end benchmark.", "",
            "## Rankings", "",
            f"Lowest pooled mass MAE: {mass[0]['variant']} ({fmt(mass[0]['metrics']['mass_g']['mae'])} g, four identical food pairs).",
            f"Lowest overall normalized MAE: {joint[0]['variant']} ({fmt(joint[0]['metrics']['overall_normalized_mae_pct'])}%, five equal-weight normalized metrics).",
            "Raw grams and kcal are never added. Normalized MAE is an exploratory weighting choice, not MAPE or a clinical score; different weights can change rankings.",
            "Only full numeric coverage is eligible. Empty plate is retained in response success/latency/tokens, excluded from numeric ranking using historical B0 nonfood status.", "",
            "| Variant | Pooled mass MAE g | Energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g | Overall normalized MAE % | Mean client s | Median client s | Token/image | OK / 5 |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for r in rows:
        m = r["metrics"]
        text.append("| " + " | ".join([r["variant"], *[fmt(m[k]["mae"]) for k in METRICS], fmt(m["overall_normalized_mae_pct"]),
                    fmt(r["mean_seconds"]),fmt(r["median_seconds"]),fmt(r["tokens"]["total_tokens"]/r["count"]),str(r["ok"])]) + " |")
    text += ["", "Mass targets mean: 223.5 g; nutrient normalization targets are the mean of the two Nutrition5k foods. LeFood nutrient GT is absent, not fabricated.", "",
             "## Combo per sample", "",
             "| Sample | Status | GT mass g | Predicted mass g | Label | Elapsed s |",
             "| --- | --- | ---: | ---: | --- | ---: |"]
    combo_preds = {(ds,r["sample_id"]):r for ds in references for r in read_jsonl(args.combo / COMBO / f"predictions/{ds}.jsonl")}
    for k,r in combo_preds.items():
        ref = expected[k]
        text.append("| " + " | ".join([r["sample_id"],r["status"],fmt(ref["reference"]["mass_g"]),
                    fmt(r.get("prediction",{}).get("mass_g")),", ".join(c["name"] for c in r.get("components",[])) or "NA",fmt(r["elapsed_seconds"])]) + " |")
    grounding = [json.loads(p.read_text())["grounding_seconds"] for p in (args.combo/COMBO/"details").glob("*.json")]
    text += ["", "## Implementation and timing", "",
             "- Prompt requests container diameter + apparent volume before total weight, with food_name/weight_g per component; no VLM nutrient output.",
             "- Parser requires geometry key order and total/component mass agreement; invalid outputs remain errors, no post-hoc repairs.",
             "- Same frozen eight-food USDA catalog and exact aliases as A6; grams/100 × source nutrient coefficients on CPU. No alias additions after seeing results.",
             "- Unknown matching or weight yields null nutrient totals. Nonfood requires null geometry and weight, empty components.",
             "- Each request, raw response, geometry, source match, prediction and runtime is saved, alongside this comparison JSON.",
             f"- Mean CPU grounding for four valid samples: {statistics.mean(grounding)*1000:.3f} ms. This is catalog arithmetic only, excludes upload/network/provider.",
             "- Client elapsed time includes encoding/request logging, network/provider wait, parsing/grounding and response persistence; table mean includes failures too.",
             "- Mobile upload, VPS network, worker queue, database/storage, polling delay and any explanation LLM call were not measured. Existing app spec uses async jobs and polling.",
             "- A4 has separate GPU-based precomputed feature latency in the earlier report, which is not included in its historical client latency here.", "",
             "## Failure and limitations", "",
             "The combo empty-plate response correctly says is_food=false but reports container_diameter_cm=20, violating the prompt's nonfood-null schema. It remains one failure; raw response is retained, no retry/repair.",
             "All variants including combo still mislabel the Bubur sample as rice. USDA arithmetic does not repair this semantic error.",
             "A1V1 and A1V2 also have one historical empty-plate schema failure each; read rankings alongside response coverage, not accuracy alone.",
             "Five images, four mass pairs and two nutrient pairs, one run per variant, already inspected dataset: exploratory, not independent validation. Historical latency is not a simultaneous paired timing benchmark.",
             "Production FastAPI behavior is unchanged; this implements the experimental candidate, not its deployment or an approved production nutrition catalog.", "",
             "## Reproduce", "", "Run from the repository root; historical B0/ablation artifacts and the frozen catalog must exist locally.", "",
             "```sh",
             "CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_qwen37_ablation.py \\",
             "  --variants A1V1_A6V1 \\",
             "  --catalog experiments/model-evaluation/catalogs/usda-sr-legacy-ablation-v1.json \\",
             "  --run-dir experiments/model-evaluation/results/qwen37-combo-2026-10-14 --resume",
             "python3 experiments/model-evaluation/scripts/compare_qwen37_variants.py",
             "```", "",
             "Resume skips both successes and recorded errors, without new inference. First run omits --resume; changed prompt/settings require a new output folder.", ""]
    save_bytes(args.combo / "COMPARISON.md", ("\n".join(text)+"\n").encode())
    save_bytes(ROOT / "docs/QWEN37_COMBO_CPU_PILOT_2026-10-14.md", ("\n".join(text)+"\n").encode())
    print(json.dumps({"mass_winner":output["mass_ranking"][0],"normalized_winner":output["normalized_ranking"][0],
                      "combo_mass_mae_g":rows[-1]["metrics"]["mass_g"]["mae"],
                      "combo_normalized_mae_pct":rows[-1]["metrics"]["overall_normalized_mae_pct"],
                      "combo_mean_seconds":rows[-1]["mean_seconds"],"combo_ok":rows[-1]["ok"]}, indent=2))


if __name__ == "__main__": main()

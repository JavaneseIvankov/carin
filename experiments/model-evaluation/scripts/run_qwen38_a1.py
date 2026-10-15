"""Paired Qwen3.8 Max A1V1/A1V2 evaluation against historical Qwen3.7 Flash."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics

from compare_qwen37_variants import aggregate_metrics
from download_datasets import ROOT, METRICS, save_bytes
from evaluate_predictions import read_jsonl
from run_evaluation import ProviderError, json_bytes, load_env, provider_call, redact, run_pipeline, validate_samples
from run_qwen37_ablation import BASELINE, MODEL as FLASH, lefood_label, normalize_native

MAX_MODEL = "qwen3.8-max"
VARIANTS = ("A1V1", "A1V2")
FLASH_RUN = ROOT / "results/qwen37-staged-ablation-2026-10-14"
DEFAULT_RUN = ROOT / "results/qwen38-a1-paired-2026-10-14"


def make_a1_call(variant, directory, key, transport=provider_call):
    def call(url, credential, payload, timeout, retries):
        # Bind sample ID locally in the main loop via the photo checksum map.
        response, tries = transport(url, credential, payload, timeout, retries)
        sample_id = call.sample_id
        save_bytes(directory / f"raw/{sample_id}.json", json_bytes(redact(response, key)))
        if not str(response.get("model", "")).startswith(MAX_MODEL):
            raise ProviderError("unexpected_provider_model", attempts=tries)
        try:
            normalized, details = normalize_native(variant, response)
        except (ValueError, KeyError, TypeError, IndexError):
            raise ProviderError("invalid_ablation_output", attempts=tries) from None
        save_bytes(directory / f"details/{sample_id}.json", json_bytes(redact(details, key)))
        return normalized, tries
    return call


def controls():
    base = json.loads((BASELINE / "run.json").read_text())["identity"]
    references = {ds:validate_samples(ROOT, ROOT/f"manifests/{ds}-50.jsonl",len(meta["samples"]))
                  for ds,meta in base["datasets"].items()}
    for ds, samples in references.items():
        assert [{"sample_id":r["sample_id"],"image_sha256":r["image_sha256"]} for r in samples] == base["datasets"][ds]["samples"]
    return base, references


def comparison(run_dir, references):
    baseline, _ = controls()
    expected = {(ds,r["sample_id"]):r for ds,rs in references.items() for r in rs}
    b0 = {(ds,r["sample_id"]):r for ds in references for r in read_jsonl(BASELINE/f"predictions/{ds}.jsonl")}
    scored = {key:r for key,r in expected.items() if b0[key]["is_food"]}
    rows=[]
    predictions_by_run={}
    failures=[]
    for variant in VARIANTS:
        historical = json.loads((FLASH_RUN/variant/"run.json").read_text())["identity"]
        for model, directory in ((FLASH,FLASH_RUN/variant),(MAX_MODEL,run_dir/variant)):
            if not (directory/"summary.json").exists(): continue
            identity=json.loads((directory/"run.json").read_text())["identity"]
            config=identity["configuration"]
            assert identity["prompt"] == historical["prompt"] and identity["datasets"] == historical["datasets"]
            assert config["model"]==model and config["base_url"]==baseline["configuration"]["base_url"]
            assert config["enable_thinking"] is False and config["json_mode"] and config["max_tokens"]==1024 and config["fallback_model"] is None
            preds={(ds,r["sample_id"]):r for ds in references for r in read_jsonl(directory/f"predictions/{ds}.jsonl")}
            predictions_by_run[(model,variant)]=preds
            assert set(preds)==set(expected)
            tokens=dict.fromkeys(("prompt_tokens","completion_tokens","total_tokens","image_tokens"),0)
            provider_models=set()
            for k,r in preds.items():
                assert r["image_sha256"]==expected[k]["image_sha256"] and not r["fallback_used"]
                request=json.loads((directory/f'requests/{r["sample_id"]}.json').read_text())
                for field,value in {"model":model,"temperature":0,"enable_thinking":False,"max_tokens":1024,
                                   "response_format":{"type":"json_object"}}.items():
                    assert request["settings"][field]==value
                assert request["prompt"]==historical["prompt"] and request["image_sha256"]==r["image_sha256"]
                raw=json.loads((directory/f'raw/{r["sample_id"]}.json').read_text())
                provider_models.add(raw.get("model"))
                assert str(raw.get("model","")).startswith(model)
                assert not raw["choices"][0]["message"].get("reasoning_content")
                for field in ("prompt_tokens","completion_tokens","total_tokens"):
                    tokens[field]+=raw["usage"][field]
                tokens["image_tokens"]+=raw["usage"].get("prompt_tokens_details",{}).get("image_tokens",0)
                if r["status"]!="ok":
                    native=json.loads(raw["choices"][0]["message"]["content"])
                    expected_fields={"is_food","container_diameter_cm","apparent_volume_cm3","weight_g","components","prediction","limitations"}
                    if variant=="A1V2": expected_fields|={"packing_factor","density_g_cm3"}
                    failures.append({"model":model,"variant":variant,"sample_id":r["sample_id"],"error":r["error"],
                                     "extra_fields":sorted(set(native)-expected_fields),"missing_fields":sorted(expected_fields-set(native)),
                                     "prediction_is_null":native.get("prediction") is None})
            times=[r["elapsed_seconds"] for r in preds.values()]
            good=[r["elapsed_seconds"] for r in preds.values() if r["status"]=="ok"]
            metrics=aggregate_metrics(scored,preds)
            ds_metrics={ds:aggregate_metrics({k:r for k,r in scored.items() if k[0]==ds},preds) for ds in references}
            labels=[{"sample_id":r["sample_id"],"reference":r["food_name"],
                     "predicted":lefood_label(preds[("lefood-set",r["sample_id"])])} for r in references["lefood-set"]]
            rows.append({"model":model,"variant":variant,"provider_models":sorted(provider_models),"metrics":metrics,
                         "dataset_metrics":ds_metrics,"labels":labels,"ok":len(good),"count":len(times),
                         "mean_seconds":statistics.mean(times),"median_seconds":statistics.median(times),
                         "mean_success_seconds":statistics.mean(good) if good else None,
                         "min_seconds":min(times),"max_seconds":max(times),"attempts":sum(r["attempts"] for r in preds.values()),
                         "tokens":tokens})
    save_bytes(run_dir/"comparison.json",json_bytes(rows))
    matched=[]
    for variant in VARIANTS:
        if (MAX_MODEL,variant) not in predictions_by_run: continue
        left=predictions_by_run[(FLASH,variant)]; right=predictions_by_run[(MAX_MODEL,variant)]
        common={k:r for k,r in scored.items() if left[k]["status"]==right[k]["status"]=="ok"
                and all(r["reference"].get(m) is None or left[k]["prediction"].get(m) is not None
                        and right[k]["prediction"].get(m) is not None for m in METRICS)}
        matched.append({"variant":variant,"common_samples":[{"dataset":k[0],"sample_id":k[1]} for k in common],
                        "flash":aggregate_metrics(common,left),"max":aggregate_metrics(common,right)})
    save_bytes(run_dir/"matched-comparison.json",json_bytes(matched))
    save_bytes(run_dir/"schema-failures.json",json_bytes(failures))
    def fmt(v): return "NA" if v is None else f"{v:.3f}"
    text=["# Qwen3.8 Max vs Qwen3.7 Flash — A1V1/A1V2 — 2026-10-14","",
          "Five paired images per variant: same historical snapshot samples, image bytes, prompt text, endpoint and generation parameters; only requested model changes.",
          "Controls: temperature=0, enable_thinking=false, JSON object mode, max_tokens=1024, no fallback. Client runs with local GPU disabled, only stdlib; vision inference is hosted.",
          "Flash responses are reused, not rerun. qwen3.8-max is a provider alias, not a dated snapshot; resolved model values are retained below.",
          "A1V1 Max's 21.5 g pooled mass MAE uses only two of four food photos with valid responses; it is not comparable to a four-photo MAE without the matched-pair check below.","",
          "## Full metric breakdown", "",
          "Each MAE cell includes valid pairs / available GT pairs. Mass has four food GTs (two per dataset); nutrients have two Nutrition5k GTs. LeFood has no nutrient GT.","",
          "| Model | Variant | Mass MAE g (n/N) | Energy MAE kcal (n/N) | Protein MAE g (n/N) | Carbs MAE g (n/N) | Fat MAE g (n/N) | Overall normalized % | Mean s | Median s | OK / 5 |",
          "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    def metric_cell(metrics, metric):
        value=metrics[metric]
        return fmt(value["mae"])+f' ({value["pairs"]}/{value["expected_pairs"]})'
    for r in rows:
        m=r["metrics"]; ds=r["dataset_metrics"]
        text.append("| "+" | ".join([r["model"],r["variant"],*[metric_cell(m,k) for k in METRICS],
                    fmt(m["overall_normalized_mae_pct"]),fmt(r["mean_seconds"]),fmt(r["median_seconds"]),str(r["ok"])])+" |")
    text += ["","## Per-dataset mass MAE", "",
             "| Model | Variant | Nutrition5k mass g (n/N) | LeFood mass g (n/N) | Valid responses / 5 |",
             "| --- | --- | ---: | ---: | ---: |"]
    for r in rows:
        ds=r["dataset_metrics"]; cells=[]
        for name in ("nutrition5k","lefood-set"):
            v=ds[name]["mass_g"]
            cells.append(fmt(v["mae"])+f' ({v["pairs"]}/{v["expected_pairs"]})')
        text.append("| "+" | ".join([r["model"],r["variant"],*cells,f'{r["ok"]}/5'])+" |")
    text += ["","Pooled mass uses four food GTs when coverage is complete. The empty plate stays in success/failure, token and latency counts, but is excluded from numeric MAE because historical B0 identifies it as nonfood. LeFood has no nutrient GT.",
             "Overall normalized score = equal mean of MAE/mean-GT × 100 over mass, energy, protein, carbs and fat; incomplete numeric coverage makes the score NA. This is not MAPE or a clinical metric.","",
             "## Matched successful food samples", "",
             "This secondary comparison explicitly restricts both models to the same successfully parsed samples. It does not excuse failures on excluded food photos or establish performance across the whole pilot.", "",
             "| Variant | Common food samples | Flash mass MAE g | Max mass MAE g | Energy pairs | Flash energy MAE kcal | Max energy MAE kcal |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    matched_notes=[]
    for r in matched:
        text.append("| "+" | ".join([r["variant"],str(len(r["common_samples"])),fmt(r["flash"]["mass_g"]["mae"]),
                    fmt(r["max"]["mass_g"]["mae"]),str(r["flash"]["energy_kcal"]["pairs"]),
                    fmt(r["flash"]["energy_kcal"]["mae"]),fmt(r["max"]["energy_kcal"]["mae"])])+" |")
        matched_notes.append(r["variant"]+" common IDs: "+", ".join(s["sample_id"] for s in r["common_samples"])+".")
    text += ["",*matched_notes]
    text += ["", "## Schema failures", ""]
    for failure in failures:
        text.append("- "+json.dumps(failure))
    text += ["",
             "## Labels, timing and coverage",""]
    for r in rows:
        text.append(f"- {r['model']} {r['variant']}: providers {r['provider_models']}; attempts {r['attempts']}; elapsed range {r['min_seconds']:.3f}–{r['max_seconds']:.3f} s; mean successful responses {fmt(r['mean_success_seconds'])} s; labels {r['labels']}.")
        text.append("  Numeric pairs: "+", ".join(f"{k} {r['metrics'][k]['pairs']}/{r['metrics'][k]['expected_pairs']}" for k in METRICS)+".")
    text += ["","## Per sample", "", "| Model | Variant | Sample | Status | GT mass g | Predicted mass g | Elapsed s |",
             "| --- | --- | --- | --- | ---: | ---: | ---: |"]
    for r in rows:
        directory=FLASH_RUN/r["variant"] if r["model"]==FLASH else run_dir/r["variant"]
        for ds in references:
            for p in read_jsonl(directory/f"predictions/{ds}.jsonl"):
                text.append("| "+" | ".join([r["model"],r["variant"],p["sample_id"],p["status"],
                            fmt(expected[(ds,p["sample_id"])]["reference"]["mass_g"]),
                            fmt(p.get("prediction",{}).get("mass_g")),fmt(p["elapsed_seconds"])])+" |")
    text += ["","## Method and reproducibility", "",
             "A1V1: diameter/volume before weight. A1V2: adds packing/density before weight. Both still predict energy/macros directly; this is not A6 grounding. The exact previous prompts and parser are reused without repair or outcome-based prompt tuning.",
             "Time is client request-to-validated/persisted-response, including API/network. The mean includes failures. Mobile upload, VPS queues, database/storage/polling and a separate explanation LLM call are not measured. Historical Flash timing was collected earlier, so these are observational timings, not controlled server benchmarks.",
             "One run per variant, five already inspected images. Read MAE with valid-pair coverage and schema failures. Provider image-token processing can differ across models despite identical input bytes.",
             "Each variant retains run metadata, request prompt/settings/hash, raw provider output, geometry details, predictions, scores. Existing Flash and production FastAPI defaults remain unchanged.", "",
             "```sh", "CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_qwen38_a1.py",
             "# Recompute report without new API calls:", "python3 experiments/model-evaluation/scripts/run_qwen38_a1.py --report-only", "```", ""]
    save_bytes(run_dir/"REPORT.md",("\n".join(text)+"\n").encode())
    save_bytes(ROOT/"docs/QWEN38_A1_PAIRED_2026-10-14.md",("\n".join(text)+"\n").encode())
    print(json.dumps([{k:r[k] for k in ("model","variant","mean_seconds","ok")} | {"pooled_mass_mae_g":r["metrics"]["mass_g"]["mae"],
                    "energy_mae_kcal":r["metrics"]["energy_kcal"]["mae"]} for r in rows],indent=2))
    return rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir",type=Path,default=DEFAULT_RUN)
    parser.add_argument("--resume",action="store_true")
    parser.add_argument("--report-only",action="store_true")
    args=parser.parse_args()
    baseline,references=controls()
    if args.report_only:
        comparison(args.run_dir,references)
        return 0
    load_env(ROOT/".env")
    key=os.environ.get("DASHSCOPE_API_KEY","").strip()
    if not key: raise ValueError("Missing local provider credential")
    indexed={r["image_sha256"]:r for rows in references.values() for r in rows}
    args.run_dir.mkdir(parents=True,exist_ok=True)
    failed=False
    for variant in VARIANTS:
        historical=json.loads((FLASH_RUN/variant/"run.json").read_text())["identity"]
        prompt=historical["prompt"]
        config=dict(historical["configuration"],model=MAX_MODEL)
        assert config["base_url"]==baseline["configuration"]["base_url"] and config["fallback_model"] is None
        directory=args.run_dir/variant
        normalize_call=make_a1_call(variant,directory,key)
        def call(url,credential,payload,timeout,retries):
            import base64
            photo=base64.b64decode(payload["messages"][0]["content"][0]["image_url"]["url"].split(",",1)[1])
            sample=indexed[hashlib.sha256(photo).hexdigest()]
            normalize_call.sample_id=sample["sample_id"]
            save_bytes(directory/f'requests/{sample["sample_id"]}.json',json_bytes({"image_sha256":sample["image_sha256"],
                       "prompt":payload["messages"][0]["content"][1]["text"],"settings":{k:v for k,v in payload.items() if k!="messages"},
                       "image_options":{}}))
            return normalize_call(url,credential,payload,timeout,retries)
        reports=run_pipeline(ROOT,directory,references,config,prompt,key,resume=args.resume and directory.exists(),call=call)
        failed=failed or any(r["error_response_count"] or r["missing_response_count"] for r in reports.values())
        print("Completed",variant,flush=True)
    comparison(args.run_dir,references)
    return 1 if failed else 0


if __name__=="__main__": raise SystemExit(main())

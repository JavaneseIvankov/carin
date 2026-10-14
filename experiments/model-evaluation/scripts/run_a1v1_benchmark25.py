"""Twenty-five paired A1V1 images per Qwen model with a fixed strict JSON schema."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import statistics

from compare_qwen37_variants import aggregate_metrics
from download_datasets import ROOT, METRICS, save_bytes
from evaluate_predictions import read_jsonl
from run_evaluation import ProviderError, json_bytes, load_env, percentile, provider_call, redact, run_pipeline, utc_now, validate_samples
from run_qwen37_ablation import BASELINE, MODEL as FLASH, normalize_native, lefood_label

MAX = "qwen3.8-max"
MODELS = (FLASH, MAX)
COUNTS = {"nutrition5k":13, "lefood-set":12}
KNOWN_NONFOOD = {("nutrition5k", "dish_1557861216")}
PROMPT = ROOT / "prompts/food-a1v1-v2.txt"
SCHEMA = ROOT / "prompts/food-a1v1-v2.schema.json"
DEFAULT_RUN = ROOT / "results/a1v1-strict-25-2026-10-14"


def response_format():
    return {"type":"json_schema", "json_schema":{"name":"food_a1v1", "strict":True,
                                                     "schema":json.loads(SCHEMA.read_text())}}


def normalize_a1v1(envelope):
    normalized, details = normalize_native("A1V1", envelope)
    native = json.loads(envelope["choices"][0]["message"]["content"])
    if not details["intermediates_before_weight"]:
        raise ValueError("Geometry keys must precede weight_g")
    if len(native["limitations"]) > 3:
        raise ValueError("At most three limitations allowed")
    if native["is_food"] is False and any(native[name] is not None for name in ("container_diameter_cm","apparent_volume_cm3")):
        raise ValueError("Nonfood geometry must be null")
    masses = [c["mass_g"] for c in native["components"]]
    details["component_sum_g"] = sum(masses) if masses and all(m is not None for m in masses) else None
    details["reported_weight_g"] = native["weight_g"]
    return normalized, details


def make_call(model, directory, indexed, key, transport=provider_call):
    def call(url, credential, payload, timeout, retries):
        photo = base64.b64decode(payload["messages"][0]["content"][0]["image_url"]["url"].split(",",1)[1])
        image_hash = hashlib.sha256(photo).hexdigest()
        sample = indexed[image_hash]
        payload["response_format"] = response_format()
        save_bytes(directory/f'requests/{sample["sample_id"]}.json', json_bytes({
            "image_sha256":image_hash, "prompt":payload["messages"][0]["content"][1]["text"],
            "settings":{k:v for k,v in payload.items() if k!="messages"}, "image_options":{}}))
        response, tries = transport(url, credential, payload, timeout, retries)
        save_bytes(directory/f'raw/{sample["sample_id"]}.json',json_bytes(redact(response,key)))
        actual = response.get("model", "")
        if not (actual == FLASH if model == FLASH else isinstance(actual,str) and actual.startswith(MAX)):
            raise ProviderError("unexpected_provider_model",attempts=tries)
        try:
            normalized, details = normalize_a1v1(response)
        except (ValueError, KeyError, TypeError, IndexError, ProviderError) as error:
            save_bytes(directory/f'validation-errors/{sample["sample_id"]}.json',
                       json_bytes(redact({"code":"invalid_a1v1_output","reason":str(error)},key)))
            raise ProviderError("invalid_a1v1_output",attempts=tries) from None
        save_bytes(directory/f'details/{sample["sample_id"]}.json',json_bytes(redact(details,key)))
        return normalized, tries
    return call


def references():
    return {ds:validate_samples(ROOT,ROOT/f"manifests/{ds}-50.jsonl",n) for ds,n in COUNTS.items()}


def describe(run_dir, refs):
    expected={(ds,r["sample_id"]):r for ds,rs in refs.items() for r in rs}
    scored={k:r for k,r in expected.items() if k not in KNOWN_NONFOOD}
    rows=[]; by_model={}; failures=[]
    endpoint=json.loads((BASELINE/"run.json").read_text())["identity"]["configuration"]["base_url"]
    for model in MODELS:
        directory=run_dir/model
        if not (directory/"summary.json").exists(): continue
        identity=json.loads((directory/"run.json").read_text())["identity"]
        config=identity["configuration"]
        assert identity["prompt"]==PROMPT.read_text() and config["base_url"]==endpoint
        assert config["response_format"]==response_format() and config["fallback_model"] is None
        preds={(ds,r["sample_id"]):r for ds in refs if (directory/f"predictions/{ds}.jsonl").exists()
               for r in read_jsonl(directory/f"predictions/{ds}.jsonl")}
        by_model[model]=preds
        assert set(preds)<=set(expected)
        tokens=dict.fromkeys(("prompt_tokens","completion_tokens","total_tokens","image_tokens","cached_tokens"),0)
        actual_models=set(); extra_field_errors=0; truncations=0
        for k,p in preds.items():
            assert p["image_sha256"]==expected[k]["image_sha256"] and not p["fallback_used"]
            request=json.loads((directory/f'requests/{p["sample_id"]}.json').read_text())
            assert request["prompt"]==PROMPT.read_text() and request["image_sha256"]==p["image_sha256"]
            for field,value in {"model":model,"temperature":0,"enable_thinking":False,"max_tokens":1024,
                                "response_format":response_format()}.items():
                assert request["settings"][field]==value
            raw_path=directory/f'raw/{p["sample_id"]}.json'
            if raw_path.exists():
                raw=json.loads(raw_path.read_text()); actual_models.add(raw.get("model"))
                assert not raw["choices"][0]["message"].get("reasoning_content")
                usage=raw.get("usage",{})
                for field in ("prompt_tokens","completion_tokens","total_tokens"):
                    tokens[field]+=usage.get(field,0)
                for field in ("image_tokens","cached_tokens"):
                    tokens[field]+=usage.get("prompt_tokens_details",{}).get(field,0)
                if raw["choices"][0].get("finish_reason")!="stop": truncations+=1
                if p["status"]!="ok":
                    try:
                        native=json.loads(raw["choices"][0]["message"]["content"])
                        allowed=set(response_format()["json_schema"]["schema"]["properties"])
                        extra_field_errors+=bool(isinstance(native,dict) and set(native)-allowed)
                    except (ValueError,TypeError): pass
            if p["status"]!="ok":
                error_path=directory/f'validation-errors/{p["sample_id"]}.json'
                failures.append({"model":model,"dataset":k[0],"sample_id":k[1],"error":p["error"],
                                 "detail":json.loads(error_path.read_text()) if error_path.exists() else None})
        metrics=aggregate_metrics(scored,preds)
        ds_metrics={ds:aggregate_metrics({k:r for k,r in scored.items() if k[0]==ds},preds) for ds in refs}
        times=[p["elapsed_seconds"] for p in preds.values()]
        good_times=[p["elapsed_seconds"] for p in preds.values() if p["status"]=="ok"]
        labels=[{"sample_id":r["sample_id"],"reference":r["food_name"],
                 "predicted":lefood_label(preds.get(("lefood-set",r["sample_id"]),{}))}
                for r in refs["lefood-set"] if r["food_name"] in ("Bubur","Nasi")]
        rows.append({"model":model,"provider_models":sorted(actual_models),"expected_images":len(expected),
                     "submitted":len(preds),"ok":len(good_times),"errors":sum(p["status"]!="ok" for p in preds.values()),
                     "missing":len(expected)-len(preds),"metrics":metrics,"dataset_metrics":ds_metrics,
                     "mean_seconds":statistics.mean(times) if times else None,
                     "median_seconds":statistics.median(times) if times else None,"p95_seconds":percentile(times,.95),
                     "mean_success_seconds":statistics.mean(good_times) if good_times else None,
                     "min_seconds":min(times) if times else None,"max_seconds":max(times) if times else None,
                     "attempts":sum(p["attempts"] for p in preds.values()),"tokens":tokens,
                     "mean_tokens_per_image":tokens["total_tokens"]/len(preds) if preds else None,
                     "extra_field_errors":extra_field_errors,"truncations":truncations,"bubur_nasi":labels})
    matched=None
    if len(by_model)==2:
        left=by_model[FLASH]; right=by_model[MAX]
        common={k:r for k,r in scored.items() if left.get(k,{}).get("status")==right.get(k,{}).get("status")=="ok"}
        matched={"common_samples":[{"dataset":k[0],"sample_id":k[1]} for k in common],
                 FLASH:aggregate_metrics(common,left),MAX:aggregate_metrics(common,right)}
    output={"variant":"A1V1-schema-v2","counts_per_model":COUNTS,
            "excluded_numeric_gt":[{"dataset":k[0],"sample_id":k[1],"reason":"Previously inspected empty plate; source mass 1 g is an artifact"} for k in KNOWN_NONFOOD],
            "rows":rows,"matched_successful_samples":matched,"failures":failures}
    save_bytes(run_dir/"comparison.json",json_bytes(output))
    def fmt(v): return "NA" if v is None else f"{v:.3f}"
    def metric_cell(m,key):
        v=m[key]; return fmt(v["mae"])+f' ({v["pairs"]}/{v["expected_pairs"]})'
    text=["# A1V1: 25 gambar per model — 14 Oktober 2026", "",
          "25 gambar yang sama untuk setiap model: 13 Nutrition5k + 12 LeFood. Pemilihan adalah prefix dari manifest 50+50 yang telah dikunci, tanpa memilih ulang berdasarkan hasil. Jumlah panggilan target 50.",
          "Varian A1V1-schema-v2: prompt diperjelas dan response_format=json_schema dengan strict=true serta additionalProperties=false pada setiap object. Kedua model mendapat prompt/schema identik; tidak boleh menambahkan field di luar diameter, volume, berat, komponen, nutrisi dan limitations.",
          "Kontrol: endpoint Singapore yang sama dengan B0; temperature=0; enable_thinking=false; max_tokens=1024; tidak ada model fallback. Inferensi dilakukan satu per satu di API Alibaba dengan client CPU-only. Retry hanya untuk network/rate-limit/server error, maksimal dua; tidak ada retry untuk jawaban yang gagal validasi.",
          "Run ini memakai prompt/format baru. Skor 5-gambar sebelumnya tidak dicampur dengan benchmark ini. Sebagian sampel sudah pernah diperiksa; benchmark belum menjadi validasi independen.", "",
          "## MAE lengkap", "",
          "Setiap sel menunjukkan MAE (jumlah pasangan numerik valid / tersedia). Target massa: 24 foto makanan, target energi/macro: 12 makanan Nutrition5k. LeFood tidak mempunyai GT nutrisi. Piring kosong yang sudah diketahui tetap masuk validasi/latency/token tetapi dikeluarkan dari skor angka sesuai keputusan sebelum inferensi.", "",
          "| Model | Mass MAE g | Energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g | Overall normalized % | Valid / 25 |",
          "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for r in rows:
        text.append("| "+" | ".join([r["model"],*[metric_cell(r["metrics"],k) for k in METRICS],
                    fmt(r["metrics"]["overall_normalized_mae_pct"]),f'{r["ok"]}/25'])+" |")
    text += ["", "Overall normalized = rata-rata lima MAE/mean-GT × 100 dengan bobot sama. Ini bukan MAPE atau skor klinis. Nilai overall menjadi NA bila coverage angka tidak lengkap; jangan memilih pemenang karena contoh sulit gagal/unknown.", "",
             "## Per dataset", "", "| Model | Dataset | Mass MAE g | Energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g |",
             "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for r in rows:
        for ds,m in r["dataset_metrics"].items():
            text.append("| "+" | ".join([r["model"],ds,*[metric_cell(m,k) for k in METRICS]])+" |")
    text += ["", "## Latency dan token", "",
             "| Model | Mean s | Median s | P95 s | Mean successful s | Range s | Total tokens | Tokens/image | Input | Output | Image tokens | Attempts |",
             "| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for r in rows:
        t=r["tokens"]
        text.append("| "+" | ".join([r["model"],*[fmt(r[k]) for k in ("mean_seconds","median_seconds","p95_seconds","mean_success_seconds")],
                    fmt(r["min_seconds"])+"–"+fmt(r["max_seconds"]),str(t["total_tokens"]),fmt(r["mean_tokens_per_image"]),
                    str(t["prompt_tokens"]),str(t["completion_tokens"]),str(t["image_tokens"]),str(r["attempts"])])+" |")
    text += ["", "Waktu adalah client wall time request sampai respons tervalidasi/tersimpan, termasuk API/network/retry. Mean mencakup respons gagal. Upload HP, antrean VPS, DB/storage dan polling mobile belum diukur. P95 memakai nearest-rank dari 25 observasi. Model dijalankan berurutan sehingga perubahan kondisi provider/jaringan tetap dapat memengaruhi perbandingan latency.",
             "Token dihitung dari semua raw response termasuk jawaban gagal. Token request yang tidak memiliki response usage tidak diketahui; biaya rupiah tidak diasumsikan.", "",
             "## Validasi dan label", ""]
    for r in rows:
        text.append(f'- {r["model"]}: ok {r["ok"]}, error {r["errors"]}, missing {r["missing"]}, extra-field errors {r["extra_field_errors"]}, truncations {r["truncations"]}; provider models {r["provider_models"]}; Bubur/Nasi {r["bubur_nasi"]}.')
    if failures:
        text += ["", "Kegagalan dicatat, tidak diperbaiki post-hoc:", ""]+["- "+json.dumps(f,ensure_ascii=False) for f in failures]
    if matched:
        text += ["", "## Perbandingan pada respons sukses yang sama", "",
                 f'Common food samples: {len(matched["common_samples"])}; identitas sampel ada di comparison.json. Tetap baca bersama kegagalan pada keseluruhan 25 gambar.', "",
                 "| Model | Mass MAE g | Energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
        for model in MODELS:
            text.append("| "+" | ".join([model,*[metric_cell(matched[model],k) for k in METRICS]])+" |")
    text += ["", "## Log per sampel", "",
             "| Model | Dataset | Sample | Status | GT mass g | Predicted g | Energy kcal | Protein g | Carbs g | Fat g | Elapsed s |",
             "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for model,preds in by_model.items():
        for k,p in preds.items():
            text.append("| "+" | ".join([model,k[0],k[1],p["status"],fmt(expected[k]["reference"]["mass_g"]),
                        *[fmt(p.get("prediction",{}).get(m)) for m in METRICS],fmt(p["elapsed_seconds"])])+" |")
    text += ["", "## Reproduksi dan cakupan", "",
             "```sh", "CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_a1v1_benchmark25.py",
             "# Melanjutkan hanya sampel yang belum diproses:","CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_a1v1_benchmark25.py --resume",
             "# Laporan saja, tanpa inferensi baru:","python3 experiments/model-evaluation/scripts/run_a1v1_benchmark25.py --report-only", "```", "",
             "Artefak: study.json mengunci pemilihan/checksum, tiap model memiliki run metadata, requests, raw responses, details, validation-errors, predictions dan reports. comparison.json menyimpan coverage, pasangan sama, label dan hasil audit kontrol.",
             "Schema/format disiapkan berdasarkan [dokumentasi resmi Alibaba](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output). JSON Schema membatasi struktur; kebenaran nama makanan, massa dan nutrisi tetap harus dievaluasi. Parser tetap memeriksa nilai finite/nonnegative, nonfood null, key order geometry dan limitations.",
             "A1V1 tetap menggunakan tebakan nutrisi langsung dari VLM. Run ini tidak memakai katalog A6, model segmentasi/depth, atau GPU lokal. Tidak ada perubahan default produksi FastAPI. Kode/prompt/laporan berada di branch feat/t32-real-ai-service dan belum di-commit.", ""]
    report="\n".join(text)+"\n"
    save_bytes(run_dir/"REPORT.md",report.encode())
    save_bytes(ROOT/"docs/A1V1_BENCHMARK25_2026-10-14.md",report.encode())
    print(json.dumps([{k:r[k] for k in ("model","ok","errors","missing","mean_seconds","mean_tokens_per_image")}
                      | {"mass_mae_g":r["metrics"]["mass_g"]["mae"],"energy_mae_kcal":r["metrics"]["energy_kcal"]["mae"]}
                      for r in rows],indent=2),flush=True)
    return rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir",type=Path,default=DEFAULT_RUN)
    parser.add_argument("--models",nargs="+",choices=MODELS,default=list(MODELS))
    parser.add_argument("--resume",action="store_true")
    parser.add_argument("--report-only",action="store_true")
    args=parser.parse_args()
    refs=references()
    if args.report_only:
        describe(args.run_dir,refs);return 0
    load_env(ROOT/".env")
    key=os.environ.get("DASHSCOPE_API_KEY","").strip()
    if not key: raise ValueError("Missing local provider credential")
    prompt=PROMPT.read_text()
    baseline=json.loads((BASELINE/"run.json").read_text())["identity"]["configuration"]
    shared={"base_url":baseline["base_url"],"fallback_model":None,"enable_thinking":False,"json_mode":True,
            "temperature":0,"max_tokens":1024,"timeout_seconds":120,"max_retries":2,
            "ablation_variant":"A1V1-schema-v2","response_format":response_format(),
            "schema_sha256":hashlib.sha256(SCHEMA.read_bytes()).hexdigest()}
    args.run_dir.mkdir(parents=True,exist_ok=True)
    selected={ds:[{"sample_id":r["sample_id"],"image_sha256":r["image_sha256"]} for r in rs] for ds,rs in refs.items()}
    plan={"variant":"A1V1-schema-v2","models":list(MODELS),"counts_per_model":COUNTS,
          "selection":"first 13/12 rows of existing locked manifests, fixed before calls",
          "samples":selected,"prompt_sha256":hashlib.sha256(prompt.encode()).hexdigest(),"controls":shared,
          "known_nonfood":[{"dataset":k[0],"sample_id":k[1]} for k in KNOWN_NONFOOD]}
    study_path=args.run_dir/"study.json"
    if study_path.exists():
        old=json.loads(study_path.read_text());old.pop("created_at",None)
        if old!=plan: raise ValueError("Locked benchmark plan changed; use a new output folder")
    else: save_bytes(study_path,json_bytes({"created_at":utc_now(),**plan}))
    indexed={r["image_sha256"]:r for rs in refs.values() for r in rs}
    failed=False
    for model in args.models:
        config=dict(shared,model=model)
        directory=args.run_dir/model
        reports=run_pipeline(ROOT,directory,refs,config,prompt,key,resume=args.resume and directory.exists(),
                             call=make_call(model,directory,indexed,key))
        failed=failed or any(r["error_response_count"] or r["missing_response_count"] for r in reports.values())
        describe(args.run_dir,refs)
    return 1 if failed else 0


if __name__=="__main__": raise SystemExit(main())

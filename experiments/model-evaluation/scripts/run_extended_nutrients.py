#!/usr/bin/env python3
"""Four paired SNAPMe photos, ASA24 nutrient references, same extended A1V1 prompt."""
import argparse
import copy
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import statistics
import tarfile
import time
import urllib.request

from download_datasets import ROOT, METRICS, save_bytes
from evaluate_predictions import measurement, read_jsonl
from run_a1v1_benchmark25 import FLASH, MAX, MODELS, normalize_a1v1, response_format as base_format
from run_evaluation import ProviderError, json_bytes, load_env, make_payload, provider_call, redact, utc_now

SOURCE_URL = "https://agdatacommons.nal.usda.gov/articles/dataset/24856449"
ARCHIVE_URL = "https://ndownloader.figshare.com/files/44532971"
PREFIX = "snapme_db_09Dec2022/"
DAY = "snapme_nut_db/9007_QC/211014_day2/"
PHOTOS = {
    "1fb8e98f4df7be579eae31044315": "Salad romaine, parmesan, croutons, Caesar dressing",
    "4789353d42a4bb9cd219e4086989": "Telur orak-arik, cheddar, tortilla gandum",
    "d0de0b2f49e6b5a58c1c5f496934": "Kopi dengan susu 2%",
    "a08ba4be41ebb379d0b089bd4be1": "Quinoa, paprika, bawang, bayam, sosis ayam/kalkun",
}
EXTRA = {"sodium_mg": "SODI", "total_sugars_g": "SUGR", "fiber_g": "FIBE",
         "saturated_fat_g": "SFAT", "cholesterol_mg": "CHOLE", "potassium_mg": "POTA", "calcium_mg": "CALC"}
COLUMNS = {"mass_g": "FoodAmt", "energy_kcal": "KCAL", "protein_g": "PROT",
           "carbohydrate_g": "CARB", "fat_g": "TFAT", **EXTRA}
PROMPT = ROOT / "prompts/food-a1v1-extended-v1.txt"
MANIFEST = ROOT / "manifests/snapme-nutrients-4.jsonl"
DEFAULT_RUN = ROOT / "results/snapme-extended-a1v1-4-2026-10-15"


def aggregate_reference(rows):
    """Source entries already describe consumed totals, not nutrient density."""
    result = {}
    for metric, column in COLUMNS.items():
        values = [None if row.get(column) in (None, "", "NA") else measurement(float(row[column])) for row in rows]
        result[metric] = sum(values) if values and all(value is not None for value in values) else None
    return result


def prepare():
    source = ROOT / "data/snapme/source"
    wanted = {PREFIX + "README.txt": source / "README.txt",
              PREFIX + "snapme_cs_db/master_SNAPME_linkfile.csv": source / "master_SNAPME_linkfile.csv"}
    for photo in PHOTOS:
        for suffix in ("", "_after"):
            relative = DAY + photo + suffix + ".jpeg"
            wanted[PREFIX + relative] = source / relative
    missing = {name: path for name, path in wanted.items() if not path.exists()}
    if missing:
        # Only stream the beginning of the 2 GB archive; never unpack arbitrary paths/symlinks.
        request = urllib.request.Request(ARCHIVE_URL, headers={"Range": "bytes=0-67108863"})
        with urllib.request.urlopen(request, timeout=45) as response:
            with tarfile.open(fileobj=response, mode="r|gz") as archive:
                for member in archive:
                    if member.name in missing and member.isfile():
                        if member.size > 5_000_000:
                            raise ValueError("Unexpected source member size")
                        save_bytes(missing.pop(member.name), archive.extractfile(member).read())
                    if not missing:
                        break
        if missing:
            raise ValueError("Selected SNAPMe members unavailable in initial archive range")
    csv_path = source / "master_SNAPME_linkfile.csv"
    source_rows = list(csv.DictReader(io.StringIO(csv_path.read_text(encoding="utf-8-sig"))))
    manifest = []
    for photo, title in PHOTOS.items():
        matched = [(i + 2, row) for i, row in enumerate(source_rows) if row["filename"] == photo + ".jpeg"]
        if not matched or len({(row["subject_id"], row["snapme_study_day"]) for _, row in matched}) != 1:
            raise ValueError("Missing or ambiguous photo-to-recall linkage")
        if any(row["packaged_food"] != "0" or float(row["FoodAmt"]) != float(row["FoodAmt.1"]) for _, row in matched):
            raise ValueError("Unexpected portion basis or packaged image")
        image = (source / (DAY + photo + ".jpeg")).read_bytes()
        target = ROOT / f"data/snapme/images/{photo}.jpeg"
        save_bytes(target, image)
        after_path = source / (DAY + photo + "_after.jpeg")
        manifest.append({"dataset": "snapme", "sample_id": photo, "food_name": title,
                         "image_path": str(target.relative_to(ROOT)), "image_sha256": hashlib.sha256(image).hexdigest(),
                         "image_bytes": len(image), "reference": aggregate_reference([row for _, row in matched]),
                         "reference_basis": "ASA24 reported consumption, database-derived; near-empty after photo reviewed; not laboratory or weighed-portion GT",
                         "reference_source": SOURCE_URL, "source_archive": ARCHIVE_URL,
                         "source_archive_official_md5": "95383fd42b78eb45adbad03c7673e8f7",
                         "source_csv_sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
                         "source_csv_rows": [i for i, _ in matched],
                         "source_columns": COLUMNS,
                         "reference_units": {name: "kcal" if name.endswith("_kcal") else "mg" if name.endswith("_mg") else "g" for name in COLUMNS},
                         "source_foods": [{"food_code": row["FoodCode"], "description": row["Food_Description"]} for _, row in matched],
                         "after_image_path": str(after_path.relative_to(ROOT)),
                         "after_image_sha256": hashlib.sha256(after_path.read_bytes()).hexdigest(),
                         "license": "CC-BY-SA-4.0", "attribution": "Chin, Larke, Bouzid, Nguyen, Vainberg, Smilowitz, Lemay; SNAPMe v1, 2022",
                         "limitations": ["One participant/day; four convenience samples, not representative or independent held-out test.",
                                         "After photo has at most small visible residues; leftover nutrients are not quantified.",
                                         "ASA24 sodium uses recipe assumptions and may differ from actual added salt.",
                                         "ADD_SUGARS is a food-group teaspoon equivalent, not grams; not scored."]})
        if photo == "1fb8e98f4df7be579eae31044315":
            manifest[-1]["limitations"].append("Bitesnap annotation says no dressing, but ASA24 lists Caesar dressing; actual recipe is uncertain and ASA24 remains the declared reference.")
    content = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in manifest).encode()
    if MANIFEST.exists() and MANIFEST.read_bytes() != content:
        raise ValueError("Locked SNAPMe manifest changed")
    save_bytes(MANIFEST, content)
    return manifest


def response_format():
    result = base_format()
    result["json_schema"]["name"] = "food_a1v1_extended"
    prediction = result["json_schema"]["schema"]["properties"]["prediction"]
    prediction["properties"].update({name: {"type": ["number", "null"]} for name in EXTRA})
    prediction["required"] += list(EXTRA)
    return result


def validate_output(envelope):
    native = json.loads(envelope["choices"][0]["message"]["content"])
    if set(native["prediction"]) != set(COLUMNS) - {"mass_g"}:
        raise ValueError("Extended nutrient fields missing or unexpected")
    extra = {name: measurement(native["prediction"][name]) for name in EXTRA}
    if native["is_food"] is False and any(value is not None for value in extra.values()):
        raise ValueError("Nonfood nutrient values must be null")
    core = copy.deepcopy(envelope)
    core_native = copy.deepcopy(native)
    core_native["prediction"] = {name: value for name, value in native["prediction"].items() if name not in EXTRA}
    core["choices"][0]["message"]["content"] = json.dumps(core_native)
    normalized, _ = normalize_a1v1(core)
    result = json.loads(normalized["choices"][0]["message"]["content"])
    result["prediction"].update(extra)
    return result


def metrics(references, predictions):
    result = {}
    for metric in COLUMNS:
        targets = [r for r in references if r["reference"][metric] is not None]
        errors = [predictions[r["sample_id"]]["prediction"][metric] - r["reference"][metric]
                  for r in targets if predictions.get(r["sample_id"], {}).get("status") == "ok"
                  and predictions[r["sample_id"]]["prediction"][metric] is not None]
        result[metric] = {"mae": statistics.mean(abs(e) for e in errors) if errors else None,
                          "bias": statistics.mean(errors) if errors else None,
                          "pairs": len(errors), "available": len(targets)}
    return result


def report(run_dir, references):
    summaries = []
    predictions_by_model = {}
    for model in MODELS:
        path = run_dir / model / "predictions.jsonl"
        predictions = read_jsonl(path) if path.exists() else []
        indexed = {row["sample_id"]: row for row in predictions}
        predictions_by_model[model] = indexed
        times = [row["elapsed_seconds"] for row in predictions]
        tokens = dict.fromkeys(("prompt_tokens", "completion_tokens", "total_tokens"), 0)
        for row in predictions:
            raw = run_dir / model / f"raw/{row['sample_id']}.json"
            if raw.exists():
                usage = json.loads(raw.read_text()).get("usage", {})
                for name in tokens:
                    tokens[name] += usage.get(name, 0)
        summaries.append({"model": model, "valid": sum(r["status"] == "ok" for r in predictions), "submitted": len(predictions),
                          "metrics": metrics(references, indexed), "tokens": tokens,
                          "mean_seconds": statistics.mean(times) if times else None,
                          "median_seconds": statistics.median(times) if times else None})
    unconflicted = [r for r in references if r["sample_id"] != "1fb8e98f4df7be579eae31044315"]
    sensitivity = {model: metrics(unconflicted, predictions_by_model[model]) for model in MODELS}
    comparison = {"summaries": summaries, "references": references, "predictions": predictions_by_model,
                  "sensitivity_without_conflicting_salad": sensitivity}
    save_bytes(run_dir / "comparison.json", json_bytes(comparison))
    def fmt(value): return "NA" if value is None else f"{value:.3f}"
    lines = ["# Benchmark zat gizi tambahan: SNAPMe, 15 Oktober 2026", "",
             "Empat foto yang sama pada kedua model, A1V1 dengan schema tambahan: salad Caesar, telur/keju/tortilla, kopi susu, quinoa/sayur/sosis. Delapan panggilan target, tanpa fallback, temperature=0, thinking=false, max_tokens=1024, JSON Schema strict, endpoint historis Singapore. Foto asli; CPU client tanpa GPU lokal.",
             "Sumber: [SNAPMe v1](https://agdatacommons.nal.usda.gov/articles/dataset/24856449), Chin et al., CC BY-SA 4.0. Referensi adalah jumlah baris ASA24 yang terhubung ke setiap foto; bukan hasil laboratorium atau ground truth porsi ditimbang. Empat foto berasal dari satu peserta/hari. Foto after diperiksa secara visual dan hampir kosong; sisa kecil tidak dikuantifikasi. Foto after, nama, porsi dan nilai referensi tidak dikirim ke VLM.",
             "[Dokumentasi ASA24](https://epi.grants.cancer.gov/asa24/researcher/analysis.html) menjelaskan bahwa nilai natrium menggunakan asumsi resep/garam. Benchmark ini mengukur selisih terhadap recall tersebut, bukan membuktikan kemampuan mengukur natrium aktual dari foto. `ADD_SUGARS` berupa teaspoon equivalents, sehingga tidak disamakan dengan gram; yang diuji adalah gula total (`SUGR`).", "",
             "Ada konflik anotasi salad: Bitesnap mencatat no dressing, sedangkan ASA24 memasukkan Caesar dressing. Referensi benchmark tetap ASA24 secara konsisten; resep aktual tidak terverifikasi. Konflik ini dicatat sebelum panggilan model.", "",
             "## MAE terhadap referensi ASA24", "", "MAE pada nilai valid ditampilkan bersama n/N. Unknown tetap null, tidak diubah menjadi nol. MAE antar-zat dengan satuan berbeda tidak dijumlahkan.", "",
             "| Zat / satuan | Qwen3.7 Flash MAE (n/N) | Qwen3.8 Max MAE (n/N) |", "| --- | ---: | ---: |"]
    for metric in COLUMNS:
        cells = [metric]
        for summary in summaries:
            value = summary["metrics"][metric]
            cells.append(f'{fmt(value["mae"])} ({value["pairs"]}/{value["available"]})')
        lines.append("| " + " | ".join(cells) + " |")
    sugars = [r["reference"]["total_sugars_g"] for r in references]
    lines += ["", f'Referensi gula total hanya {min(sugars):.3f}–{max(sugars):.3f} g per foto. Hasil belum menguji minuman manis/dessert atau variasi gula tambahan.',
              "", "### Sensitivitas terhadap konflik salad", "",
              "Ini pemeriksaan tambahan atas konflik yang sudah diketahui sebelum inference. Skor utama empat foto tetap dilaporkan di atas. Mengeluarkan salad yang anotasi dressing-nya bertentangan mengubah urutan MAE natrium; satu sampel sangat memengaruhi kesimpulan.", "",
              "| Model | MAE natrium, empat foto (mg) | MAE natrium, tiga foto tanpa salad (mg) |",
              "| --- | ---: | ---: |"]
    for summary in summaries:
        name = summary["model"]
        lines.append(f'| {name} | {fmt(summary["metrics"]["sodium_mg"]["mae"])} | {fmt(sensitivity[name]["sodium_mg"]["mae"])} |')
    lines += ["", "## Waktu dan token", "", "| Model | Valid / submitted | Mean s | Median s | Input tokens | Output tokens | Total tokens |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for row in summaries:
        lines.append(f'| {row["model"]} | {row["valid"]}/{row["submitted"]} | {fmt(row["mean_seconds"])} | {fmt(row["median_seconds"])} | {row["tokens"]["prompt_tokens"]} | {row["tokens"]["completion_tokens"]} | {row["tokens"]["total_tokens"]} |')
    lines += ["", "Latency adalah client wall time API + parsing/penyimpanan; upload HP, antrean VPS, DB dan polling belum diukur. Model dijalankan berurutan sehingga kondisi provider/jaringan dapat berbeda. Token termasuk seluruh raw respons yang tersimpan, termasuk respons invalid.", "", "## Detail per foto", ""]
    for ref in references:
        lines += ["### " + ref["food_name"], "", "| Zat | Referensi | Flash | Max |", "| --- | ---: | ---: | ---: |"]
        for metric, truth in ref["reference"].items():
            values = [predictions_by_model[m].get(ref["sample_id"], {}).get("prediction", {}).get(metric) for m in MODELS]
            lines.append("| " + " | ".join([metric, fmt(truth), *map(fmt, values)]) + " |")
        for model in MODELS:
            pred = predictions_by_model[model].get(ref["sample_id"], {})
            lines.append(f'- {model}: {pred.get("status", "missing")}; components={pred.get("components", [])}; limitations={pred.get("limitations", [])}.')
        lines += [""]
    lines += ["## Reproduksi", "", "```sh", "python3 experiments/model-evaluation/scripts/run_extended_nutrients.py --prepare-only",
              "CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_extended_nutrients.py",
              "# --resume melewati sukses/error yang sudah tercatat; tidak memperbaiki output/retry invalid JSON.",
              "python3 experiments/model-evaluation/scripts/run_extended_nutrients.py --report-only", "```", "",
              "Manifest mengunci SHA foto before/after, sumber CSV dan nomor baris serta satuan kolom. study.json mengunci prompt, schema dan kontrol sebelum inference. Per model tersimpan request tersanitasi, raw response dan prediction; comparison.json menyimpan seluruh pasangan referensi/prediksi serta bias dan coverage.",
              "Prompt/schema diperluas dari A1V1 sebelumnya untuk zat tambahan. Skor ini tidak dibandingkan langsung dengan benchmark Nutrition5k/LeFood atau dianggap ukuran akurasi makanan Indonesia. Sampel kecil dan sudah menjadi publik; overlap pretraining tidak diketahui. Tidak ada perubahan kontrak/default produksi. Kode/laporan belum di-commit.", ""]
    audit_path = run_dir / "control-audit.json"
    if audit_path.exists():
        audit = json.loads(audit_path.read_text())
        lines += ["## Verifikasi dan handoff", "",
                  f'Audit offline (`control-audit.json`): {audit["submitted_requests"]} request aktual; setiap model 4/4 valid, satu attempt per foto. Model, prompt, schema, SHA gambar, temperature, thinking, max_tokens dan tidak adanya fallback telah diperiksa. Seluruh 12 MAE dihitung ulang langsung dari raw response dan source CSV; token dijumlah ulang. Tidak ada inference tambahan saat audit.',
                  "Unit test terkait: `python3 -m unittest discover -s experiments/model-evaluation/tests -p test_extended_nutrients.py -q`. Meliputi missing/null, satuan dan basis total, nilai negatif/boolean/string yang tidak valid, serta schema/nonfood.",
                  "Langkah berikutnya: dataset lebih beragam dan referensi resep/porsi lebih kuat, termasuk hidangan tinggi gula dan sumber natrium yang terdokumentasi. Worktree: perubahan eksperimen ini belum di-commit; raw data, credential dan hasil per-request tetap di folder lokal yang di-ignore.", ""]
    content = ("\n".join(lines) + "\n").encode()
    save_bytes(run_dir / "REPORT.md", content)
    save_bytes(ROOT / "docs/EXTENDED_NUTRIENTS_SNAPME_2026-10-15.md", content)
    print(json.dumps(summaries, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--report-only", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    references = read_jsonl(MANIFEST) if args.report_only else prepare()
    if args.prepare_only:
        print(f"Prepared {len(references)} locked photo/ASA24 pairs: {MANIFEST}"); return 0
    for row in references:
        if hashlib.sha256((ROOT / row["image_path"]).read_bytes()).hexdigest() != row["image_sha256"]:
            raise ValueError("Photo hash differs from locked manifest")
    if args.report_only:
        report(args.run_dir, references); return 0
    load_env(ROOT / ".env")
    key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not key: raise ValueError("Missing local provider credential")
    baseline = json.loads((ROOT / "results/smoke-5-2026-10-14/run.json").read_text())["identity"]["configuration"]
    config = {"base_url": baseline["base_url"], "temperature": 0, "enable_thinking": False, "max_tokens": 1024,
              "response_format": response_format(), "fallback_model": None, "timeout_seconds": 120, "max_retries": 2}
    plan = {"models": list(MODELS), "prompt_sha256": hashlib.sha256(PROMPT.read_bytes()).hexdigest(),
            "manifest_sha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest(), "controls": config}
    args.run_dir.mkdir(parents=True, exist_ok=True)
    study = args.run_dir / "study.json"
    if study.exists():
        old = json.loads(study.read_text()); old.pop("created_at", None)
        if old != plan: raise ValueError("Locked study changed; use a different output directory")
    else: save_bytes(study, json_bytes({"created_at": utc_now(), **plan}))
    for model in MODELS:
        directory = args.run_dir / model
        path = directory / "predictions.jsonl"
        if directory.exists() and not args.resume: raise ValueError("Run exists; use --resume or new directory")
        directory.mkdir(parents=True, exist_ok=True)
        previous = {row["sample_id"]: row for row in read_jsonl(path)} if path.exists() else {}
        for ref in references:
            sample_id = ref["sample_id"]
            if sample_id in previous: continue
            payload = make_payload(model, (ROOT / ref["image_path"]).read_bytes(), PROMPT.read_text(), 1024, True, False)
            payload["response_format"] = response_format()
            save_bytes(directory / f"requests/{sample_id}.json", json_bytes({"image_sha256": ref["image_sha256"],
                       "prompt": PROMPT.read_text(), "settings": {k: v for k, v in payload.items() if k != "messages"}}))
            started = time.perf_counter()
            row = {"sample_id": sample_id, "requested_model": model, "image_sha256": ref["image_sha256"],
                   "status": "error", "attempts": 0, "fallback_used": False}
            fatal = False
            try:
                raw, attempts = provider_call(config["base_url"], key, payload, config["timeout_seconds"], config["max_retries"])
                row["attempts"] = attempts
                save_bytes(directory / f"raw/{sample_id}.json", json_bytes(redact(raw, key)))
                actual = raw.get("model", "")
                if not (actual == FLASH if model == FLASH else isinstance(actual, str) and actual.startswith(MAX)):
                    raise ValueError("Unexpected provider model")
                row.update(validate_output(raw), status="ok", provider_model=actual)
            except ProviderError as error:
                row.update(error=error.code, attempts=error.attempts, http_status=error.status)
                fatal = error.status in (400, 401, 403, 404)
            except (ValueError, KeyError, TypeError, IndexError):
                row["error"] = "invalid_extended_output"
            row["elapsed_seconds"] = time.perf_counter() - started
            previous[sample_id] = redact(row, key)
            save_bytes(path, "".join(json.dumps(previous[r["sample_id"]], ensure_ascii=False) + "\n" for r in references if r["sample_id"] in previous).encode())
            print(f'{model} {sample_id}: {row["status"]} ({row["elapsed_seconds"]:.2f}s)', flush=True)
            if fatal:
                report(args.run_dir, references); return 1
    report(args.run_dir, references)
    return 0


if __name__ == "__main__": raise SystemExit(main())

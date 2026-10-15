#!/usr/bin/env python3
"""Locked Qwen3.7 Flash ablations, using the historical B0 endpoint and samples."""

import argparse
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import time

from download_datasets import ROOT, METRICS, save_bytes
from evaluate_predictions import measurement, read_jsonl
from run_evaluation import (
    ProviderError, json_bytes, load_env, parse_model_response, provider_call,
    redact, run_pipeline, utc_now, validate_base_url, validate_samples,
)

MODEL = "qwen3.7-flash-2026-07-15"
BASELINE = ROOT / "results" / "smoke-5-2026-10-14"
VARIANTS = ("A1V1", "A1V2", "A2V1", "A2V2", "A3V1", "A3V2", "A4V1", "A4V2", "A6V1")
COMBO = "A1V1_A6V1"
SUPPORTED_VARIANTS = (*VARIANTS, COMBO)
GEOMETRY = ("container_diameter_cm", "apparent_volume_cm3", "packing_factor", "density_g_cm3")


def prompt_for(variant, base_prompt):
    intro = base_prompt.split("Return exactly one JSON object", 1)[0]
    if variant == COMBO:
        return base_prompt.split("Estimate the total edible portion", 1)[0] + (
            "Estimate only visible food component names and edible masses. Use common ingredient "
            "names with preparation (raw/cooked/boiled/baked) where visible. Do not predict "
            "calories or nutrients; these will be calculated from a reference catalog separately.\n"
            "Return exactly one JSON object, in this key order:\n"
            "- is_food: boolean.\n"
            "- container_diameter_cm: estimated container diameter in cm, nonnegative number or null.\n"
            "- apparent_volume_cm3: estimated total apparent food volume in cm3, nonnegative number or null.\n"
            "- weight_g: total edible mass in grams, nonnegative number or null.\n"
            "- components: array of objects with food_name (nonempty string) and weight_g "
            "(nonnegative grams or null).\n"
            "- limitations: array of uncertainty/assumption strings.\n"
            "Estimate diameter and volume from visual evidence before weight_g. These are "
            "estimates, not measured dimensions. Total weight_g must equal the sum of component "
            "weights when all are known, otherwise it must be null. Unknown values remain null, "
            "never zero. For nonfood set is_food=false, diameter/volume/weight=null and "
            "components=[]. No density/packing constants, extra fields, Markdown or extra text. JSON only.\n"
        )
    if variant in ("A1V1", "A1V2"):
        fields = GEOMETRY[:2] if variant == "A1V1" else GEOMETRY
        return intro + "\nReturn exactly one JSON object, in this key order:\n" + \
            "- is_food: boolean.\n" + "".join(f"- {name}: nonnegative number or null.\n" for name in fields) + \
            "- weight_g: total edible mass in grams, nonnegative number or null.\n" + \
            "- components: array of objects with name and mass_g, as visual estimates.\n" + \
            "- prediction: object containing energy_kcal, protein_g, carbohydrate_g, fat_g; numbers or null.\n" + \
            "- limitations: array of strings describing uncertainty and assumptions.\n" + \
            "Estimate the intermediate fields from visual evidence; these are not measurements. " + \
            "Diameter is in cm, volume in cm3, packing_factor is dimensionless within [0,1], " + \
            "density_g_cm3 is g/cm3. Output all intermediate fields before weight_g. " + \
            "For non-food, numeric values are null and components is empty. JSON only.\n"
    if variant.startswith("A2"):
        instruction = (
            "\nPortion estimation instruction: Do NOT use textbook serving defaults such as "
            "100 g, 150 g, or 200 g. Estimate the pictured edible volume from the image and "
            "derive mass from volume and density rather than substituting a generic serving. "
            "Do not merely change a default by one gram to evade this instruction.\n"
        )
        if variant == "A2V2":
            instruction += (
                "Experimental fixed physical priors for this ablation: porridge/liquid density "
                "1.0 g/cm3, packing 1.0; cooked rice density 0.85 g/cm3, packing 0.8; "
                "cut fruit/tuber pieces packing 0.65. These are imposed assumptions, not "
                "measured properties. Apply mass = apparent envelope volume * packing * density. "
                "Texture rule: watery/coalesced surface favors rice porridge; visibly separate "
                "grains favor cooked rice. Describe uncertainty if texture is ambiguous.\n"
            )
        return intro + instruction + "Return exactly one JSON object" + base_prompt.split("Return exactly one JSON object", 1)[1]
    if variant == "A6V1":
        return base_prompt.split("Estimate the total edible portion", 1)[0] + (
            "Estimate only the pictured edible component names and masses in grams. Use "
            "common ingredient names with preparation (raw/cooked/boiled/baked) where visible. "
            "Do not predict calories or nutrients. Unknown mass remains null, never zero.\n"
            "Return exactly one JSON object with is_food (boolean), components (array of "
            "objects with food_name: nonempty string and weight_g: nonnegative number or null), "
            "and limitations (array of strings). For nonfood use is_food=false and components=[]. "
            "JSON only, no Markdown or extra text.\n"
        )
    return base_prompt


def normalized_name(name):
    return re.sub(r"[^a-z0-9]+", " ", name.casefold()).strip()


def ground_nutrients(components, catalog):
    aliases = {}
    for food in catalog["foods"]:
        if food["basis_grams"] != 100 or not food.get("source", {}).get("fdc_id"):
            raise ValueError("Catalog must have explicit 100 g basis and source food IDs")
        for value in food["per_100g"].values():
            measurement(value)
        for alias in food["aliases"]:
            key = normalized_name(alias)
            if key in aliases:
                raise ValueError("Duplicate catalog alias")
            aliases[key] = food
    prediction = dict.fromkeys(METRICS)
    masses = [measurement(c["mass_g"]) for c in components]
    if masses and all(m is not None for m in masses):
        prediction["mass_g"] = sum(masses)
    matches = []
    for component in components:
        food = aliases.get(normalized_name(component["name"]))
        matches.append({"food_name": component["name"], "weight_g": component["mass_g"],
                        "match": food["canonical_name"] if food else None,
                        "source": food["source"] if food else None})
    for nutrient in METRICS[1:]:
        values = []
        for component, mass in zip(components, masses):
            food = aliases.get(normalized_name(component["name"]))
            coefficient = measurement(food["per_100g"].get(nutrient)) if food else None
            values.append(mass / 100 * coefficient if mass is not None and coefficient is not None else None)
        if values and all(v is not None for v in values):
            prediction[nutrient] = sum(values)
    return prediction, matches


def normalize_native(variant, envelope, catalog=None):
    response = copy.deepcopy(envelope)
    choice = response["choices"][0]
    if choice.get("finish_reason") != "stop":
        raise ProviderError("incomplete_output")
    native = json.loads(choice["message"]["content"])
    extra = {}
    if variant in ("A1V1", "A1V2"):
        fields = GEOMETRY[:2] if variant == "A1V1" else GEOMETRY
        expected = {"is_food", *fields, "weight_g", "components", "prediction", "limitations"}
        if not isinstance(native, dict) or set(native) != expected:
            raise ValueError("Invalid micro-geometry schema")
        for field in (*fields, "weight_g"):
            measurement(native[field])
        if "packing_factor" in fields and native["packing_factor"] is not None and native["packing_factor"] > 1:
            raise ValueError("Packing factor above one")
        if not isinstance(native["prediction"], dict) or set(native["prediction"]) != set(METRICS[1:]):
            raise ValueError("Invalid native nutrient fields")
        order = list(native)
        extra = {"intermediates": {f: native[f] for f in fields},
                 "intermediates_before_weight": all(order.index(f) < order.index("weight_g") for f in fields)}
        if variant == "A1V2" and all(native[f] is not None for f in GEOMETRY[1:]):
            extra["physics_product_g"] = native["apparent_volume_cm3"] * native["packing_factor"] * native["density_g_cm3"]
        native = {"is_food": native["is_food"], "components": native["components"],
                  "prediction": {"mass_g": native["weight_g"], **native["prediction"]},
                  "limitations": native["limitations"]}
    elif variant in ("A6V1", COMBO):
        expected = {"is_food", "components", "limitations"}
        if variant == COMBO:
            expected |= {*GEOMETRY[:2], "weight_g"}
        if not isinstance(native, dict) or set(native) != expected:
            raise ValueError("Invalid food-name/mass-only schema")
        if variant == COMBO:
            for field in (*GEOMETRY[:2], "weight_g"):
                measurement(native[field])
            order = list(native)
            if not all(order.index(f) < order.index("weight_g") for f in GEOMETRY[:2]):
                raise ValueError("Geometry must precede total weight")
            if native["is_food"] is False and any(native[f] is not None for f in GEOMETRY[:2]):
                raise ValueError("Nonfood geometry must be null")
            extra = {"intermediates": {f:native[f] for f in GEOMETRY[:2]},
                     "intermediates_before_weight": True, "reported_weight_g": native["weight_g"]}
        components = []
        for c in native["components"]:
            if set(c) != {"food_name", "weight_g"} or not isinstance(c["food_name"], str) or not c["food_name"].strip():
                raise ValueError("Invalid component")
            measurement(c["weight_g"])
            components.append({"name": c["food_name"], "mass_g": c["weight_g"]})
        started = time.perf_counter()
        prediction, matches = ground_nutrients(components, catalog)
        grounding_seconds = time.perf_counter() - started
        if variant == COMBO:
            total, reported = prediction["mass_g"], native["weight_g"]
            if (total is None) != (reported is None) or total is not None and abs(total-reported) > 0.001:
                raise ValueError("Total weight differs from component sum")
        extra.update(catalog_version=catalog["version"], matches=matches, grounding_seconds=grounding_seconds)
        native = {"is_food": native["is_food"], "components": components,
                  "prediction": prediction, "limitations": native["limitations"]}
    choice["message"]["content"] = json.dumps(native, allow_nan=False)
    parse_model_response(response)
    return response, extra


def lefood_label(row):
    if row.get("status") != "ok":
        return None
    name = " ".join(c["name"] for c in row["components"]).casefold()
    if re.search(r"\bor\b|possibly|perhaps", name):
        return None
    if any(word in name for word in ("porridge", "bubur", "congee", "gruel")):
        return "Bubur"
    if any(word in name for word in ("rice", "nasi")):
        return "Nasi"
    return None


def report_study(study_dir, references):
    sources = [("B0", BASELINE)] + [(v, study_dir / v) for v in SUPPORTED_VARIANTS if (study_dir / v / "summary.json").exists()]
    rows = []
    for variant, directory in sources:
        summary = json.loads((directory / "summary.json").read_text())
        reports = summary["datasets"]
        predictions = [r for ds in references
                       if (directory / "predictions" / f"{ds}.jsonl").exists()
                       for r in read_jsonl(directory / "predictions" / f"{ds}.jsonl")]
        totals = dict.fromkeys(("prompt_tokens", "completion_tokens", "total_tokens", "image_tokens"), 0)
        for r in predictions:
            # Original provider responses expose per-modality details.
            raw_path = directory / "raw" / f"{r['sample_id']}.json" if variant != "B0" else directory / r.get("response_path", "missing")
            if raw_path.is_file():
                usage = json.loads(raw_path.read_text()).get("usage", {})
                for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    totals[key] += usage.get(key, 0)
                totals["image_tokens"] += usage.get("prompt_tokens_details", {}).get("image_tokens", 0)
        labels = []
        for reference in references["lefood-set"]:
            r = next((r for r in predictions if r["sample_id"] == reference["sample_id"]), {})
            labels.append({"sample_id": reference["sample_id"], "reference": reference["food_name"],
                           "predicted": lefood_label(r), "correct": lefood_label(r) == reference["food_name"]})
        rows.append({"variant": variant, "dataset_metrics": {ds: reports[ds]["metrics"] for ds in references},
                     "response_count": len(predictions), "ok_count": sum(r["status"] == "ok" for r in predictions),
                     "tokens": totals, "median_seconds": statistics.median([r["elapsed_seconds"] for r in predictions]) if predictions else None,
                     "lefood_labels": labels, "lefood_label_correct": sum(r["correct"] for r in labels)})
    save_bytes(study_dir / "comparison.json", json_bytes(rows))
    def fmt(value):
        return "NA" if value is None else f"{value:.3f}"
    text = ["# Qwen3.7 Flash staged ablation — 2026-10-14", "",
            "Exploratory paired pilot: the same 3 Nutrition5k + 2 LeFood images as historical B0.",
            "Each group is compared independently with B0; V2 is cumulative only within its group.",
            "Model/endpoint/temperature/thinking/JSON/max_tokens are locked; no fallback or model comparison.", "",
            "| Variant | N5k mass MAE g | N5k energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g | LeFood mass MAE g | LeFood labels correct / 2 | Median API s | Total tokens | Image tokens | OK / 5 |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for row in rows:
        n = row["dataset_metrics"]["nutrition5k"]
        l = row["dataset_metrics"]["lefood-set"]
        text.append("| " + " | ".join([row["variant"], *[fmt(n[k]["mae"]) for k in METRICS],
                    fmt(l["mass_g"]["mae"]), str(row["lefood_label_correct"]), fmt(row["median_seconds"]),
                    str(row["tokens"]["total_tokens"]), str(row["tokens"]["image_tokens"]), str(row["ok_count"])]) + " |")
    text += ["", "## Coverage and label review", "",
             "MAE only uses numeric pairs. The correct empty-plate response is null; source mass 1 g is a non-food artifact.",
             "LeFood has no energy/macro ground truth, so its nutrient MAE is NA. Do not interpret unavailable values as zero.",
             "LeFood label accuracy uses the locked Bubur/Nasi cases and the versioned lexical mapping; ambiguous labels are unresolved.",
             "Nutrition5k mixed-dish labels include a deprecated ingredient, so a broad recognition accuracy is not invented.", ""]
    for row in rows:
        text.append(f"- {row['variant']}: numeric mass coverage Nutrition5k {row['dataset_metrics']['nutrition5k']['mass_g']['valid_prediction_count']}/3; LeFood {row['dataset_metrics']['lefood-set']['mass_g']['valid_prediction_count']}/2; labels {row['lefood_labels']}.")
    text += ["", "API latency excludes precomputed local CV and catalog preparation; auxiliary timings are retained separately.",
             "Prompts, controls, checksums, raw responses, per-sample request text, CV features and source matches are retained locally.",
             "The dataset has already been inspected in earlier work. These are exploratory interventions, not independent validation.",
             "Physics constants are user-requested experimental priors, not measured densities or approved production rules.",
             "No additional variants beyond V2 and no thinking runs are included in this study.", ""]
    save_bytes(study_dir / "REPORT.md", ("\n".join(text) + "\n").encode())
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, default=ROOT / "results/qwen37-staged-ablation-2026-10-14")
    parser.add_argument("--variants", nargs="+", choices=SUPPORTED_VARIANTS, default=list(VARIANTS))
    parser.add_argument("--cv-metadata", type=Path)
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    load_env(ROOT / ".env")
    key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not key:
        raise ValueError("Missing local provider credential")
    baseline = json.loads((BASELINE / "run.json").read_text())["identity"]
    base_config = baseline["configuration"]
    assert base_config["model"] == MODEL and base_config["enable_thinking"] is False
    references = {ds: validate_samples(ROOT, ROOT / f"manifests/{ds}-50.jsonl", len(meta["samples"]))
                  for ds, meta in baseline["datasets"].items()}
    for ds, rows in references.items():
        assert [{"sample_id": r["sample_id"], "image_sha256": r["image_sha256"]} for r in rows] == baseline["datasets"][ds]["samples"]
        assert all(r["status"] == "ok" and not r.get("fallback_used") and r["provider_model"] == MODEL
                   for r in read_jsonl(BASELINE / "predictions" / f"{ds}.jsonl"))
    config = {"base_url": validate_base_url(base_config["base_url"]), "model": MODEL,
              "fallback_model": None, "enable_thinking": False, "json_mode": True,
              "timeout_seconds": base_config["timeout_seconds"], "max_retries": base_config["max_retries"], "max_tokens": 1024}
    cv = json.loads(args.cv_metadata.read_text()) if args.cv_metadata else None
    catalog = json.loads(args.catalog.read_text()) if args.catalog else None
    indexed = {r["image_sha256"]: r for rows in references.values() for r in rows}
    args.run_dir.mkdir(parents=True, exist_ok=True)
    study_path = args.run_dir / "study.json"
    study = json.loads(study_path.read_text()) if study_path.exists() else {"created_at": utc_now()}
    study.update(control={**config, "temperature": 0, "response_format": {"type": "json_object"}},
                 baseline=str(BASELINE), requested_variants=args.variants,
                 baseline_identity_sha256=hashlib.sha256(json_bytes(baseline)).hexdigest())
    study.setdefault("invocations", []).append({"recorded_at": utc_now(), "variants": args.variants,
                                              "resume": args.resume})
    save_bytes(study_path, json_bytes(study))
    failed = False
    for variant in args.variants:
        if variant.startswith("A4") and cv is None or variant in ("A6V1", COMBO) and catalog is None:
            raise ValueError(f"{variant} requires its real CV metadata/catalog before inference")
        prompt = prompt_for(variant, baseline["prompt"])
        save_bytes(ROOT / f"prompts/qwen37-ablation/{variant}.txt", prompt.encode())
        variant_dir = args.run_dir / variant
        variant_config = dict(config, ablation_variant=variant)
        if variant.startswith("A4"):
            variant_config["cv_metadata_sha256"] = hashlib.sha256(args.cv_metadata.read_bytes()).hexdigest()
        if variant in ("A6V1", COMBO):
            variant_config["catalog_sha256"] = hashlib.sha256(args.catalog.read_bytes()).hexdigest()
        def call(url, credential, payload, timeout, retries):
            image = base64.b64decode(payload["messages"][0]["content"][0]["image_url"]["url"].split(",", 1)[1])
            sample = indexed[hashlib.sha256(image).hexdigest()]
            details = {}
            if variant == "A3V1":
                payload["messages"][0]["content"][0]["min_pixels"] = 786432
            if variant == "A3V2":
                payload["vl_high_resolution_images"] = True
            if variant.startswith("A4"):
                feature = cv["samples"][sample["sample_id"]]
                if feature["image_sha256"] != sample["image_sha256"]:
                    raise ValueError("CV image checksum mismatch")
                details["area_coverage_ratio"] = feature["area_coverage_ratio"]
                if variant == "A4V2":
                    details["relative_depth_score"] = feature["relative_depth_score"]
                payload["messages"][0]["content"][1]["text"] += (
                    "\nAuxiliary model observations: " + json.dumps(details) +
                    ". Area ratio is segmented food pixels divided by the union of food and container pixels. "
                    + ("Relative depth is dimensionless inverse-depth contrast to visible container; it is NOT cm or grams. " if variant == "A4V2" else "") +
                    "These model measurements can be noisy; null means unavailable.\n"
                )
            save_bytes(variant_dir / f"requests/{sample['sample_id']}.json", json_bytes({
                "image_sha256": sample["image_sha256"], "prompt": payload["messages"][0]["content"][1]["text"],
                "settings": {k: v for k, v in payload.items() if k != "messages"},
                "image_options": {k:v for k,v in payload["messages"][0]["content"][0].items() if k not in ("image_url", "type")},
            }))
            response, tries = provider_call(url, credential, payload, timeout, retries)
            save_bytes(variant_dir / f"raw/{sample['sample_id']}.json", json_bytes(redact(response, key)))
            try:
                normalized, additional = normalize_native(variant, response, catalog)
            except (ValueError, KeyError, TypeError, IndexError) as error:
                raise ProviderError("invalid_ablation_output", attempts=tries) from None
            save_bytes(variant_dir / f"details/{sample['sample_id']}.json", json_bytes(redact({**details, **additional}, key)))
            return normalized, tries
        reports = run_pipeline(ROOT, variant_dir, references, variant_config, prompt, key,
                               resume=args.resume and variant_dir.exists(), call=call)
        print(f"Completed {variant}: " + json.dumps({ds: r["metrics"]["mass_g"] for ds,r in reports.items()}), flush=True)
        failed = failed or any(r["error_response_count"] or r["missing_response_count"] for r in reports.values())
        report_study(args.run_dir, references)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

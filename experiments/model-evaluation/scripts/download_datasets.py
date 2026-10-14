#!/usr/bin/env python3
"""Fetch small, reproducible evaluation subsets; Python standard library only."""

import argparse
import concurrent.futures
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import random
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
GCS = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/"
LEFOOD_API = "https://data.mendeley.com/public-api/datasets/cchsk79jkt"
METRICS = ("mass_g", "energy_kcal", "protein_g", "carbohydrate_g", "fat_g")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def fetch(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": "CarinEvaluationDataset/0.1"}
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def save_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)


def cached_fetch(path, url):
    if not path.exists():
        save_bytes(path, fetch(url))
    return path.read_bytes()


def number(value):
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError(f"Invalid nonnegative measurement: {value!r}")
    return result


def parse_nutrition_csv(data):
    """Published CSV has SIX dish fields and SEVEN fields per ingredient.

    The README's schema differs from the downloadable CSV; do not shift the
    first ingredient or treat its ID as an ingredient-count column.
    """
    records = {}
    for row in csv.reader(io.StringIO(data.decode("utf-8-sig"))):
        if not row:
            continue
        if len(row) < 13 or (len(row) - 6) % 7 or not row[0].startswith("dish_"):
            raise ValueError(f"Unexpected Nutrition5k row schema: {row[:7]}")
        energy, mass, fat, carbs, protein = map(number, row[1:6])
        ingredients = []
        for index in range(6, len(row), 7):
            if not row[index].startswith("ingr_"):
                raise ValueError("Unexpected Nutrition5k ingredient ID")
            grams, kcal, ingr_fat, ingr_carbs, ingr_protein = map(
                number, row[index + 2:index + 7]
            )
            ingredients.append({
                "source_id": row[index], "name": row[index + 1],
                "mass_g": grams, "energy_kcal": kcal,
                "fat_g": ingr_fat, "carbohydrate_g": ingr_carbs,
                "protein_g": ingr_protein,
            })
        if row[0] in records:
            raise ValueError(f"Duplicate dish ID: {row[0]}")
        records[row[0]] = {
            "sample_id": row[0],
            "reference": {"mass_g": mass, "energy_kcal": energy,
                          "protein_g": protein, "carbohydrate_g": carbs, "fat_g": fat},
            "ingredients": ingredients,
        }
    return records


def xlsx_rows(data):
    """Read the source workbook's first sheet, including sparse/string cells."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(t.text or "" for t in si.findall(".//m:t", NS))
                       for si in root.findall("m:si", NS)]
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        for row in root.findall(".//m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                column = "".join(c for c in cell.attrib["r"] if c.isalpha())
                value = cell.find("m:v", NS)
                text = value.text if value is not None else ""
                if cell.attrib.get("t") == "s":
                    text = strings[int(text)]
                elif cell.attrib.get("t") == "inlineStr":
                    text = "".join(t.text or "" for t in cell.findall(".//m:t", NS))
                values[column] = text or ""
            yield int(row.attrib["r"]), values


def lefood_records(workbook, files, audit=None):
    available = {file["filename"]: file for file in files}
    records, seen = [], set()
    rows = iter(xlsx_rows(workbook))
    _, header = next(rows)
    expected = {"A": "ID", "B": "Name of the food", "C": "Image Before Eaten",
                "D": "Weight Before Eaten (g)"}
    if any(header.get(key) != value for key, value in expected.items()):
        raise ValueError(f"LeFood-Set workbook headers changed: {header}")
    for row_number, row in rows:
        filename = row.get("C", "").strip()
        if not filename:
            continue  # The source workbook also contains formatted blank rows.
        file = available.get(filename)
        if file is None:
            if audit is not None:
                audit.setdefault("unavailable_image_rows", []).append({
                    "source_row": row_number, "original_filename": filename,
                    "food_name": row.get("B", ""),
                    "reason": "Workbook image absent from published v1 file listing",
                })
            continue
        details = file["content_details"]
        digest = details["sha256_hash"]
        if digest in seen:
            if audit is not None:
                audit.setdefault("duplicate_image_rows", []).append(row_number)
            continue
        seen.add(digest)
        mass = number(row.get("D"))
        name = row.get("B", "").strip()
        if not name or mass == 0 or "bef" not in filename.casefold():
            raise ValueError(f"Invalid before-meal record at row {row_number}")
        records.append({
            "sample_id": f"lefood-{row['A']}",
            "food_name": name, "source_row": row_number,
            "reference": {key: mass if key == "mass_g" else None for key in METRICS},
            "image_url": details["download_url"],
            "original_filename": filename, "source_file_id": file["id"],
            "image_sha256": digest, "image_bytes": details["size"],
        })
    return records


def balanced_sample(records, count, seed, group):
    if count < 1 or len(records) < count:
        raise ValueError(f"Need {count} unique samples; only {len(records)} available")
    buckets = {}
    for record in sorted(records, key=lambda item: item["sample_id"]):
        buckets.setdefault(group(record), []).append(record)
    rng = random.Random(seed)
    keys = sorted(buckets)
    rng.shuffle(keys)
    for bucket in buckets.values():
        rng.shuffle(bucket)
    selected = []
    while len(selected) < count:
        for key in keys:
            if buckets[key]:
                selected.append(buckets[key].pop())
                if len(selected) == count:
                    break
    return sorted(selected, key=lambda item: item["sample_id"])


def nutrition5k_candidates(cache):
    sources = ("dish_metadata_cafe1.csv", "dish_metadata_cafe2.csv")
    records = {}
    for filename in sources:
        url = GCS + "metadata/" + filename
        parsed = parse_nutrition_csv(cached_fetch(cache / filename, url))
        if records.keys() & parsed.keys():
            raise ValueError("Nutrition5k source CSVs contain duplicate dish IDs")
        for record in parsed.values():
            record["reference_source"] = url
        records.update(parsed)
    test = cached_fetch(cache / "depth_test_ids.txt", GCS + "dish_ids/splits/depth_test_ids.txt")
    train = cached_fetch(cache / "depth_train_ids.txt", GCS + "dish_ids/splits/depth_train_ids.txt")
    test_ids, train_ids = set(test.decode().split()), set(train.decode().split())
    if test_ids & train_ids:
        raise ValueError("Official Nutrition5k train/test IDs overlap")
    candidates = []
    for sample_id in sorted(test_ids):
        if sample_id not in records:
            raise ValueError(f"Missing Nutrition5k metadata: {sample_id}")
        record = records[sample_id]
        record.update({
            "dataset": "nutrition5k", "dataset_version": "CVPR-2021-release",
            "source_split": "official_depth_test", "reference_basis": "weighed_ingredients_and_database_nutrients",
            "image_url": GCS + f"imagery/realsense_overhead/{sample_id}/rgb.png",
            "original_filename": "rgb.png", "source_file_id": sample_id + "/rgb.png",
            "dataset_url": "https://github.com/google-research-datasets/Nutrition5k",
            "license": "CC-BY-4.0",
            "limitations": ["California cafeteria domain; not an Indonesian benchmark",
                            "Ingredient list includes ingredients not visible in a photo"],
        })
        candidates.append(record)
    return candidates


def lefood_candidates(cache):
    metadata = json.loads(cached_fetch(cache / "dataset-metadata.json", LEFOOD_API))
    if metadata.get("id") != "cchsk79jkt" or metadata.get("version") != 1:
        raise ValueError("Expected LeFood-Set cchsk79jkt version 1")
    files = metadata["files"]
    source = next(file for file in files if file["filename"] == "data_original.xlsx")
    workbook = cached_fetch(cache / "data_original.xlsx", source["content_details"]["download_url"])
    if hashlib.sha256(workbook).hexdigest() != source["content_details"]["sha256_hash"]:
        raise ValueError("LeFood-Set workbook checksum mismatch")
    audit = {"dataset_id": "cchsk79jkt", "dataset_version": 1,
             "workbook_sha256": source["content_details"]["sha256_hash"],
             "published_file_count": len(files), "unavailable_image_rows": [],
             "duplicate_image_rows": []}
    records = lefood_records(workbook, files, audit)
    audit["eligible_unique_before_images"] = len(records)
    save_bytes(cache.parent.parent.parent / "manifests" / "lefood-set-source-audit.json",
               (json.dumps(audit, ensure_ascii=False, indent=2) + "\n").encode())
    print(f"lefood-set: excluded {len(audit['unavailable_image_rows'])} workbook rows "
          "without published images", flush=True)
    for record in records:
        record.update({
            "dataset": "lefood-set", "dataset_version": "1", "source_split": "unspecified",
            "reference_basis": "digital_scale_before_meal",
            "reference_source": "https://data.mendeley.com/datasets/cchsk79jkt/1",
            "reference_workbook_sha256": source["content_details"]["sha256_hash"],
            "dataset_url": "https://data.mendeley.com/datasets/cchsk79jkt/1",
            "license": "CC-BY-4.0",
            "limitations": ["No source nutrient labels; evaluate recognition/portion only",
                            "No official held-out split; pretrained overlap is not established"],
        })
    return records


def get_image(root, record):
    path = root / record["image_path"]
    data = path.read_bytes() if path.exists() else fetch(record["image_url"])
    if not (data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff")):
        raise ValueError(f"Not a PNG/JPEG image: {record['sample_id']}")
    digest = hashlib.sha256(data).hexdigest()
    if record.get("image_sha256") and digest != record["image_sha256"]:
        raise ValueError(f"Image checksum mismatch: {record['sample_id']}")
    if record.get("image_bytes") and len(data) != record["image_bytes"]:
        raise ValueError(f"Image size mismatch: {record['sample_id']}")
    if not path.exists():
        save_bytes(path, data)
    record.update(image_sha256=digest, image_bytes=len(data))
    return record


def download_dataset(root, dataset, count, seed, workers):
    manifest = root / "manifests" / f"{dataset}-{count}.jsonl"
    if manifest.exists():
        records = [json.loads(line) for line in manifest.read_text().splitlines() if line]
        if len(records) != count or any(record["selection_seed"] != seed for record in records):
            raise ValueError("Existing manifest count/seed mismatch; choose a separate --output directory")
    else:
        cache = root / "data" / dataset / "source"
        if dataset == "nutrition5k":
            candidates = nutrition5k_candidates(cache)
            group = lambda record: "single" if len(record["ingredients"]) == 1 else "2-4" if len(record["ingredients"]) <= 4 else "5+"
        else:
            candidates = lefood_candidates(cache)
            group = lambda record: record["food_name"].casefold()
        records = balanced_sample(candidates, count, seed, group)
        for record in records:
            extension = Path(record["original_filename"]).suffix.lower()
            record.update(selection_seed=seed, subset_purpose="evaluation_only",
                          image_path=f"data/{dataset}/images/{record['sample_id']}{extension}")
        print(f"{dataset}: selected {count} of {len(candidates)} unique candidates", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        records = list(pool.map(lambda record: get_image(root, record), records))
    if len({record["image_sha256"] for record in records}) != count:
        raise ValueError(f"{dataset}: selected images contain byte-identical duplicates")
    serialized = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    save_bytes(manifest, serialized.encode())
    summary = {"dataset": dataset, "count": count, "seed": seed,
               "image_bytes": sum(record["image_bytes"] for record in records),
               "manifest_sha256": hashlib.sha256(serialized.encode()).hexdigest(),
               "reference_counts": {key: sum(record["reference"][key] is not None for record in records)
                                    for key in METRICS}}
    print(json.dumps(summary, indent=2), flush=True)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", choices=("all", "nutrition5k", "lefood-set"), default="all")
    parser.add_argument("--count", type=int, default=50, help="Images PER dataset")
    parser.add_argument("--seed", type=int, default=32)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--output", type=Path, default=ROOT)
    args = parser.parse_args()
    if args.workers < 1 or args.count < 1:
        parser.error("count and workers must be positive")
    datasets = ("nutrition5k", "lefood-set") if args.dataset == "all" else (args.dataset,)
    for dataset in datasets:
        download_dataset(args.output.resolve(), dataset, args.count, args.seed, args.workers)


if __name__ == "__main__":
    main()

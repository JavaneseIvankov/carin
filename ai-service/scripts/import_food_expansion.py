"""Rebuild draft candidates from pinned, selected official source rows.

Extraction: python scripts/import_food_expansion.py --extract --cache-dir /tmp/food-sources
Requires openpyxl only during extraction. Builds use the checked-in row snapshot.
Never publishes a manifest, imports a database, or approves source use.
"""

import argparse
import hashlib
import html
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA = Path(__file__).resolve().parents[1] / "data"
IMPORT = DATA / "import"
KEYS = ("energyKcal", "carbohydrateG", "proteinG", "fatG", "fiberG", "sugarsG", "sodiumMg")
URLS = {
    "fndds": "https://www.ars.usda.gov/ARSUserFiles/80400530/apps/2021-2023%20FNDDS%20At%20A%20Glance%20-%20FNDDS%20Nutrient%20Values.xlsx",
    "mext": "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx",
}
LICENSES = {
    "fndds": {
        "name": "U.S. Public Domain (USDA FNDDS); FoodData Central states CC0 1.0; attribution retained.",
        "url": "https://agdatacommons.nal.usda.gov/articles/dataset/Food_and_Nutrient_Database_for_Dietary_Studies_FNDDS_/24660933",
    },
    "mext": {
        "name": "MEXT permits reuse of food composition data with source attribution: 日本食品標準成分表（八訂）増補2023年から引用.",
        "url": "https://www.mext.go.jp/a_menu/syokuhinseibun/index.htm",
    },
    "mfds": {
        "name": "MFDS attribution required; item-specific open license not confirmed; reuse review pending.",
        "url": "https://www.mfds.go.kr/wpge/m_34/de010803l001.do",
    },
}
TITLES = {
    "fndds": "USDA FNDDS 2021–2023, At A Glance nutrient values",
    "mext": "日本食品標準成分表（八訂）増補2023年; corrected 2026-03-27",
    "mfds": "MFDS K-FIND 식품영양성분 데이터베이스; item snapshot 2026-10-15",
}
BASES = {
    "fndds": "Per 100 g food as described, US survey recipe/reference. Columns: Energy (kcal), Carbohydrate (g), Protein (g), Total Fat (g), Fiber total dietary (g), Sugars total (g), Sodium (mg). carbohydrateG is source-reported total carbohydrate, NOT available carbohydrate. No recipe substitution, fiber subtraction, or energy recalculation. Not an Indonesian chain/menu specification.",
    "mext": "Per 100 g edible portion in the specified preparation state. ENERC_KCAL, CHOAVL (available carbohydrate, mass basis), PROT-, FAT-, FIB-, NA; total sugars absent from this main table and null. Parenthesized estimated values are retained numerically with raw notation in the snapshot; Tr, dash and missing are null, not zero. NA is sodium mg, not salt-equivalent g. Japanese standard composition, not a whole meal unless explicitly described.",
    "mfds": "Official detail page explicitly reports per 100g. Source-reported energy kcal; carbohydrate, protein, fat, total sugars and dietary fiber g; sodium mg. carbohydrateG is the reported carbohydrate, not harmonized to available carbohydrate. Displayed zeros retained, absent/dash values null. Preparation, origin, generation method and dates preserved in the extraction snapshot. A Korean reference recipe, not a measured Indonesian restaurant meal. Total content weight is NOT imported as a recommended serving.",
}


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def number(raw):
    """Retain explicit numeric estimates; never turn a trace/missing value into zero."""
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        value = float(raw)
    elif isinstance(raw, str) and re.fullmatch(r"(?:\d+(?:\.\d+)?|\(\d+(?:\.\d+)?\))", raw.strip()):
        value = float(raw.strip().strip("()"))
    elif raw is None or str(raw).strip() in {"", "-", "－", "―", "Tr", "(Tr)"}:
        return None
    else:
        raise ValueError(f"Unrecognized nutrient notation: {raw!r}")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid nutrient: {raw!r}")
    return value


def plain(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def parse_mfds(document):
    metadata = {plain(k): plain(v) for k, v in re.findall(
        r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>", document, re.S)}
    if metadata.get("영양성분 함량 기준량") != "100g":
        raise ValueError("MFDS page must explicitly use a 100g basis")
    mapping = dict(zip(KEYS, ("에너지", "탄수화물", "단백질", "지방", "식이섬유", "당류", "나트륨")))
    values, raw = {}, {}
    for key, label in mapping.items():
        matches = re.findall(
            r'<span[^>]*><i class="hidden">영양성분</i>' + label
            + r'</span>\s*<span[^>]*><i class="hidden">100g당 함량</i>(.*?)</span>', document, re.S)
        if len(matches) != 1:
            raise ValueError(f"MFDS missing/duplicate nutrient cell: {label}")
        cell = plain(matches[0])
        raw[key] = cell
        if cell in {"", "-"}:
            values[key] = None
            continue
        unit = "㎉" if key == "energyKcal" else "㎎" if key == "sodiumMg" else "g"
        match = re.fullmatch(r"([\d,]+(?:\.\d+)?)" + unit, cell)
        if not match:
            raise ValueError(f"MFDS unexpected unit/notation: {label}={cell!r}")
        values[key] = number(match[1].replace(",", ""))
    return values, raw, metadata


def fetch(url, path):
    if not path.exists():
        with urlopen(Request(url, headers={"User-Agent": "Carin-nutrition-research/0.1"}), timeout=60) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def apply_completions(catalog, dataset, completion):
    """Apply only previously missing cells, with explicit reference/estimate provenance."""
    if completion["status"] != "draft":
        raise ValueError("Only draft completions can be imported")
    foods = {food["id"]: food for food in catalog["foods"]}
    seen = set()
    dataset["sources"] = [s for s in dataset["sources"] if not s["id"].startswith("completion-")]
    for entry in completion["entries"]:
        food_id, key = entry["foodId"], entry["nutrient"]
        if (food_id, key) in seen or key not in KEYS:
            raise ValueError("Duplicate or unknown completion nutrient")
        seen.add((food_id, key))
        source = dict(entry["source"])
        expected_id = f"completion-{food_id}-{key.lower()}"
        if source["id"] != expected_id or source["kind"] != "nutrition" or source["synthetic"]:
            raise ValueError("Invalid completion source identity")
        if entry["evidenceId"] not in completion["evidence"]:
            raise ValueError("Missing completion evidence")
        estimated = entry["method"] != "reference_supplement"
        if entry["estimated"] != estimated or (estimated and not source["title"].startswith("ESTIMATED — ")):
            raise ValueError("An estimate must be explicitly labeled")
        food = foods[food_id]
        if food["per100g"][key] is not None and food["nutrientSourceIds"][key] != expected_id:
            raise ValueError(f"Completion would overwrite a reference value: {food_id}/{key}")
        value = number(entry["value"])
        if value is None:
            raise ValueError("A completion cannot replace missing with missing")
        food["per100g"][key] = value
        food["nutrientSourceIds"][key] = source["id"]
        dataset["sources"].append(source)


def extract(cache):
    import openpyxl  # Optional offline-curation dependency, not a service dependency.

    cache.mkdir(parents=True, exist_ok=True)
    selection = read_json(IMPORT / "selection.json")
    tables, upstream = {}, {}
    for source, url in URLS.items():
        path = cache / f"{source}.xlsx"
        payload = fetch(url, path)
        sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = {}
        for rownum, row in enumerate(sheet.values, 1):
            if source == "fndds" and rownum == 2:
                expected = {0: "Food code", 1: "Main food description", 4: "Energy (kcal)",
                            5: "Protein (g)", 6: "Carbohydrate (g)", 7: "Sugars, total\n(g)",
                            8: "Fiber, total dietary (g)", 9: "Total Fat (g)", 45: "Sodium (mg)"}
                if any(row[col] != label for col, label in expected.items()):
                    raise ValueError("FNDDS nutrient column layout changed")
            if source == "mext" and rownum == 12:
                expected = {6: "ENERC_KCAL", 9: "PROT-", 12: "FAT-", 15: "CHOAVL", 18: "FIB-", 23: "NA"}
                if any(row[col] != label for col, label in expected.items()):
                    raise ValueError("MEXT nutrient column layout changed")
            code = row[0] if source == "fndds" else row[1]
            if (source == "fndds" and isinstance(code, int)) or (source == "mext" and isinstance(code, str) and code.isdigit()):
                rows[str(code)] = (rownum, row)
        tables[source] = (sheet.title, rows)
        upstream[source] = {"url": url, "sha256": hashlib.sha256(payload).hexdigest()}

    def selected_row(item):
        source, code = item["source"], item["code"]
        if source == "mfds":
            url = "https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?" + urlencode({
                "searchFoodCd": code, "searchRegionCd": "ZZ", "searchMonthCd": "AVG"})
            payload = fetch(url, cache / f"{code}.html")
            document = payload.decode("utf-8")
            # Confirm food identity as well as units before importing values.
            title = re.search(r'<meta property="og:title" content="([^"]+)"', document)
            if not title or html.unescape(title[1]).split(" | ")[0] != item["originalName"]:
                raise ValueError(f"MFDS name drift for {code}")
            values, raw, metadata = parse_mfds(document)
            location = f"foodCd={code}; region=ZZ; month=AVG; original name={item['originalName']}"
            sha = hashlib.sha256(payload).hexdigest()
        else:
            sheet, rows = tables[source]
            rownum, row = rows[code]
            name = row[1] if source == "fndds" else row[3]
            if name != item["originalName"]:
                raise ValueError(f"Workbook name drift for {code}")
            columns = (4, 6, 5, 9, 8, 7, 45) if source == "fndds" else (6, 15, 9, 12, 18, None, 23)
            raw = {key: row[col] if col is not None else None for key, col in zip(KEYS, columns)}
            values = {key: number(value) for key, value in raw.items()}
            location = f"sheet={sheet}; row={rownum}; food code={code}; original name={name}"
            metadata = {"columnIndicesZeroBased": dict(zip(KEYS, columns))}
            url, sha = upstream[source]["url"], upstream[source]["sha256"]
        return {**item, "url": url, "upstreamSha256": sha, "location": location,
                "raw": raw, "per100g": values, "metadata": metadata}

    with ThreadPoolExecutor(max_workers=3) as executor:
        rows = list(executor.map(selected_row, selection))
    write_json(IMPORT / "selected-source-rows.json", {
        "retrievedOn": "2026-10-15", "upstreamFiles": upstream, "rows": rows})


def build():
    snapshot = read_json(IMPORT / "selected-source-rows.json")
    selection = read_json(IMPORT / "selection.json")
    rows = snapshot["rows"]
    if [{k: r[k] for k in ("source", "code", "displayName", "originalName", "category")} for r in rows] != selection:
        raise ValueError("Selection changed; re-extract and review source rows first")
    catalog = read_json(DATA / "catalog.json")
    dataset = read_json(DATA / "nutrition-dataset.json")
    manifest = read_json(DATA / "capability-manifest.json")
    rules = read_json(DATA / "rules.json")
    reviews = read_json(DATA / "review-metadata.json")
    if manifest["publicationStatus"] != "unpublished" or any(
        manifest[key] for key in ("supportedPhotoFoodIds", "nutrients")
    ) or any(c["personalizationSupported"] for c in manifest["conditions"]) or any(reviews["artifacts"][key]["status"] != "draft" for key in (
        "catalog", "nutrition-dataset", "rules", "capability-manifest")) or any(
        review["status"] != "draft" for review in reviews["artifacts"]["sources"].values()
    ) or any(
        review["status"] != "draft" for review in reviews["artifacts"]["rulesById"].values()
    ):
        raise ValueError("Importer only operates on wholly draft, unpublished bundles")
    catalog_version, dataset_version = "catalog-draft-0.3.0", "nutrition-multicuisine-draft-0.2.0"
    # Only replace this importer's namespace, preserving the 51 Indonesian records.
    prefixes = ("fndds-", "mext-", "mfds-")
    catalog["foods"] = [f for f in catalog["foods"] if not f["id"].startswith(prefixes)]
    dataset["sources"] = [s for s in dataset["sources"] if not s["id"].startswith(prefixes)]
    for row in rows:
        source = row["source"]
        food_id = f"{source}-{row['code'].lower()}"
        source_id = food_id + "-nutrition"
        values = {k: number(row["per100g"][k]) for k in KEYS}
        catalog["foods"].append({"id": food_id, "displayName": row["displayName"],
            "aliases": [row["originalName"]], "preparation": row["originalName"],
            "per100g": values, "servings": [],
            "nutrientSourceIds": {k: source_id if v is not None else None for k, v in values.items()}})
        dataset["sources"].append({"id": source_id, "kind": "nutrition", "title": TITLES[source],
            "datasetVersion": dataset_version, "itemRef": row["location"], "url": row["url"],
            "license": LICENSES[source], "basis": BASES[source], "synthetic": False})
    completion_path = IMPORT / "nutrient-completions.json"
    if completion_path.exists():
        apply_completions(catalog, dataset, read_json(completion_path))
        catalog_version, dataset_version = "catalog-draft-0.4.0", "nutrition-multicuisine-draft-0.3.0"
    if (rules["rules"] or rules["conditions"]) and (
        rules["catalogVersion"] != catalog_version or rules["nutritionDatasetVersion"] != dataset_version
    ):
        raise ValueError("Review rule dependencies before changing catalog/dataset versions")
    catalog["catalogVersion"] = manifest["catalogVersion"] = catalog_version
    dataset["datasetVersion"] = manifest["nutritionDatasetVersion"] = dataset_version
    rules["catalogVersion"] = catalog_version
    rules["nutritionDatasetVersion"] = dataset_version
    for source in dataset["sources"]:
        if source["kind"] == "health_rule":
            source["datasetVersion"] = rules["ruleSetVersion"]
        else:
            source["datasetVersion"] = dataset_version
    draft = {"status": "draft", "reviewer": None, "approvedAt": None, "approvalId": None,
             "boundVersion": None, "contentSha256": None}
    reviews["artifacts"]["sources"] = {s["id"]: dict(draft) for s in dataset["sources"]}
    for name, obj in (("catalog", catalog), ("nutrition-dataset", dataset),
                      ("rules", rules), ("capability-manifest", manifest), ("review-metadata", reviews)):
        write_json(DATA / f"{name}.json", obj)
    print(f"Built {len(catalog['foods'])} draft foods, {len(dataset['sources'])} source records")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extract", action="store_true")
    parser.add_argument("--cache-dir", type=Path)
    args = parser.parse_args()
    if args.extract:
        if args.cache_dir is None:
            parser.error("--extract requires --cache-dir")
        extract(args.cache_dir)
    build()

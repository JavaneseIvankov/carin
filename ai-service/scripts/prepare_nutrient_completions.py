"""Prepare source-backed draft nutrient completions; never call a VLM.

Requires openpyxl and local official downloads. See data/NUTRIENT_COMPLETION.md.
All cross-food transfers and partial sugar sums are explicitly estimates.
"""

import argparse
import csv
import hashlib
import io
import re
import zipfile
from pathlib import Path

from import_food_expansion import DATA, IMPORT, KEYS, LICENSES, number, plain, read_json, write_json

SR_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
CARBS_URL = "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_13.xlsx"
PANGANKU_URL = "https://www.panganku.org/id-ID/view"
FAO_URL = "https://www.fao.org/4/Y5022E/y5022e04.htm"
PANGANKU_LICENSE = {"name": "Panganku public table; explicit reuse license not located; review pending.", "url": None}
COLS = dict(zip(KEYS, (4, 6, 5, 9, 8, 7, 45)))
SR_NUTRIENTS = {"1008": "energyKcal", "1005": "carbohydrateG", "1003": "proteinG",
                "1004": "fatG", "1079": "fiberG", "2000": "sugarsG", "1093": "sodiumMg"}

# Explicit human-curated food matches. These are not automatic alias decisions.
PANGANKU_MATCHES = {
    "idn-mie-ayam": "AP085", "idn-sop-daging-sapi": "FP069",
    "idn-mangga-gedong-gadung": "ER056", "idn-nasi-tim": "AP002", "idn-nasi-putih": "AP001",
    "idn-kacang-tanah-tanpa-kulit": "CR032", "idn-tempe-kedelai-murni": "CP077",
    "idn-tahu": "CP061", "idn-tahu-goreng": "CP062", "idn-telur-ayam": "HR002",
    "idn-hati-ayam": "FR007", "idn-daging-ayam": "FR005", "idn-daging-sapi": "FR026",
    "idn-ikan-teri": "GR068", "idn-bayam-rebus": "DP002",
    "tkpsi-beras-mentah": "AR003", "tkpsi-jagung-segar": "AR015", "tkpsi-kentang": "BR013",
    "tkpsi-ubi-jalar": "BR028", "tkpsi-talas": "BR004", "tkpsi-ikan-bandeng": "GR007",
    "tkpsi-ikan-mujair": "GR048", "tkpsi-ikan-tongkol": "GR070", "tkpsi-ikan-kembung": "GR050",
    "tkpsi-tomat": "DR161", "tkpsi-bayam-segar": "DR008", "tkpsi-kangkung-segar": "DR100",
    "tkpsi-wortel": "DR166", "tkpsi-kacang-kedelai": "CR017", "tkpsi-pisang": "ER074", "tkpsi-pepaya": "ER073",
}
# Broader labels/varieties are still estimates, even when the local food family matches.
BROAD_LOCAL_MATCHES = {
    "idn-mangga-gedong-gadung", "idn-telur-ayam", "idn-daging-sapi", "idn-ikan-teri",
    "tkpsi-beras-mentah", "tkpsi-jagung-segar", "tkpsi-ubi-jalar", "tkpsi-talas",
    "tkpsi-ikan-tongkol", "tkpsi-ikan-kembung", "tkpsi-bayam-segar", "tkpsi-kacang-kedelai", "tkpsi-pisang",
}
SR_MATCHES = {
    "idn-mangga-gedong-gadung": "169910", "idn-kacang-tanah-tanpa-kulit": "172430",
    "idn-tempe-kedelai-murni": "174270",  # Soybean proxy: fermentation changes sugar content.
    "idn-tahu": "172476", "idn-tahu-goreng": "172451", "idn-telur-ayam": "171287",
    "idn-hati-ayam": "171060", "idn-daging-ayam": "171447", "idn-daging-sapi": "171796",
    "tkpsi-beras-mentah": "169756", "tkpsi-jagung-segar": "169998", "tkpsi-kentang": "170026",
    "tkpsi-ubi-jalar": "168482", "tkpsi-talas": "169308",
    "tkpsi-ikan-lele": "175165", "tkpsi-ikan-bandeng": "173675", "tkpsi-ikan-mujair": "175176",
    "tkpsi-ikan-tongkol": "175156", "tkpsi-ikan-kembung": "173672", "tkpsi-ikan-tuna": "175159",
    "tkpsi-tomat": "170457", "tkpsi-bayam-segar": "168462", "tkpsi-kangkung-segar": "169301",
    "tkpsi-wortel": "170393", "tkpsi-kacang-kedelai": "174270", "tkpsi-pisang": "173944", "tkpsi-pepaya": "169926",
}
FNDDS_MATCHES = {
    "idn-mie-ayam": "58403040", "idn-sop-daging-sapi": "75652010",
    "idn-soto-daging-sapi": "75652010", "idn-soto-ayam": "28340660",
    "idn-bubur-nasi": "56205101", "idn-nasi-goreng": "58150310",
    "idn-nasi-tim": "56205101", "idn-nasi-putih": "56205008", "idn-nasi-uduk": "58161200",
    "idn-ikan-mas-bumbu-kuning": "27150320", "idn-ikan-mas-pepes": "26100160",
    "idn-ikan-asin-asap": "26100190", "idn-ikan-kembung-goreng-resep": "26121140",
    "idn-sayur-sop-ayam": "28340660", "idn-daging-ayam-goreng": "24107070",
    "idn-dendeng-sapi": "21602100", "idn-ikan-teri": "26100190", "idn-ikan-pindang": "26121180",
    "idn-bayam-rebus": "72125211", "idn-sayur-bayam": "72125211",
    "idn-tumis-bayam": "72125217", "idn-tumis-kangkung": "72125217",
    "mext-18040": "27146150", "mext-18001": "27116100", "mext-18018": "71405010",
    "mext-18020": "26319140", "mext-18002": "58111110", "mext-18012": "58112510",
    "mext-18030": "32105210", "mext-18031": "27418410", "mext-18039": "75207021",
}


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def read_panganku(path, code):
    payload = path.read_bytes()
    document = re.sub(r"<!--.*?-->", "", payload.decode("utf-8"), flags=re.S)
    if "<strong>100 g</strong>" not in document:
        raise ValueError(f"Panganku {code}: unconfirmed 100g basis")
    metadata, values, raw = {}, {}, {}
    names = {"Energi (Energy)": ("energyKcal", "Kal"), "Karbohidrat (CHO)": ("carbohydrateG", "g"),
             "Protein (Protein)": ("proteinG", "g"), "Lemak (Fat)": ("fatG", "g"),
             "Serat (Fibre)": ("fiberG", "g"), "Natrium (Na)": ("sodiumMg", "mg")}
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", document, re.S | re.I):
        cells = [plain(v) for v in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
        if len(cells) == 3:
            metadata[cells[0]] = cells[2]
        if len(cells) != 2 or cells[0] not in names:
            continue
        key, unit = names[cells[0]]
        cell = cells[1].lstrip(":").strip()
        raw[key] = cell
        match = re.fullmatch(r"([\d,]+(?:\.\d+)?) " + unit, cell)
        values[key] = number(match[1].replace(",", "")) if match else None
        if match is None and cell not in {"", "- " + unit, "-"}:
            raise ValueError(f"Panganku {code}: unknown unit or value {cell!r}")
    if metadata.get("Kode") != code:
        raise ValueError("Panganku code drift")
    return {"url": PANGANKU_URL, "itemRef": f"POST view haha={code}; code={code}; name={metadata['Nama']}",
            "per100g": values, "raw": raw, "metadata": metadata, "upstreamSha256": digest(payload)}


def prepare(sr_zip, fndds_xlsx, mext_xlsx, panganku_cache):
    import openpyxl

    catalog = read_json(DATA / "catalog.json")
    foods = {food["id"]: food for food in catalog["foods"]}
    # Re-extraction owns only cells recorded by this completion workflow.
    old = IMPORT / "nutrient-completions.json"
    if old.exists():
        for entry in read_json(old)["entries"]:
            food = foods[entry["foodId"]]
            if food["nutrientSourceIds"][entry["nutrient"]] == entry["source"]["id"]:
                food["per100g"][entry["nutrient"]] = None
    evidence = {}
    payload = sr_zip.read_bytes()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        base = archive.namelist()[0]
        def records(name):
            return csv.DictReader(io.TextIOWrapper(archive.open(base + name)))
        sr = {r["fdc_id"]: {"description": r["description"], "per100g": {}, "nutrientRecords": []} for r in records("food.csv")}
        for row in records("food_nutrient.csv"):
            if row["nutrient_id"] in SR_NUTRIENTS:
                sr[row["fdc_id"]]["per100g"][SR_NUTRIENTS[row["nutrient_id"]]] = number(row["amount"])
                sr[row["fdc_id"]]["nutrientRecords"].append(row)
    fndds = {str(r[0]): (i, r) for i, r in enumerate(openpyxl.load_workbook(fndds_xlsx, read_only=True, data_only=True).worksheets[0].values, 1) if isinstance(r[0], int)}
    carbs = {r[1]: (i, r) for i, r in enumerate(openpyxl.load_workbook(mext_xlsx, read_only=True, data_only=True).worksheets[0].values, 1) if isinstance(r[1], str) and r[1].isdigit()}

    def sr_evidence(code):
        key = "sr-" + code
        if key not in evidence:
            evidence[key] = {**sr[code], "url": SR_URL, "itemRef": f"SR Legacy 2018; fdc_id={code}; {sr[code]['description']}",
                             "upstreamSha256": digest(payload)}
        return key

    def fndds_evidence(code):
        key = "fndds-" + code
        if key not in evidence:
            rownum, row = fndds[code]
            evidence[key] = {"url": "https://www.ars.usda.gov/ARSUserFiles/80400530/apps/2021-2023%20FNDDS%20At%20A%20Glance%20-%20FNDDS%20Nutrient%20Values.xlsx",
                "itemRef": f"FNDDS 2021-2023; sheet FNDDS Nutrient Values; row {rownum}; food code {code}; {row[1]}",
                "description": row[1], "per100g": {k: number(row[c]) for k, c in COLS.items()},
                "upstreamSha256": digest(fndds_xlsx.read_bytes())}
        return key

    entries = []
    def add(food, key, value, method, evidence_key, note, inputs=None):
        if food["per100g"][key] is not None:
            raise ValueError(f"Would overwrite existing reference: {food['id']} {key}")
        value = number(value)
        if method != "reference_supplement":
            value = round(value, 2)
        food["per100g"][key] = value
        ev = evidence[evidence_key]
        estimated = method != "reference_supplement"
        src_id = f"completion-{food['id']}-{key.lower()}"
        food["nutrientSourceIds"][key] = src_id
        license = PANGANKU_LICENSE if evidence_key.startswith("panganku-") else LICENSES["mext"] if evidence_key.startswith("mext-") else LICENSES["fndds"] if not evidence_key.startswith("energy-") else {"name": "Derived from draft source macros; underlying data permission remains pending.", "url": None}
        source = {"id": src_id, "kind": "nutrition", "title": ("ESTIMATED — " if estimated else "Reference supplement — ") + food["displayName"] + " / " + key,
                  "datasetVersion": "nutrition-multicuisine-draft-0.3.0", "url": ev["url"], "itemRef": ev["itemRef"],
                  "license": license, "basis": f"Target={food['id']}; nutrient={key}; per100g; method={method}. {note} This is a draft food-reference value, not a measurement of the user's dish.", "synthetic": False}
        entries.append({"foodId": food["id"], "nutrient": key, "value": value, "method": method,
                        "estimated": estimated, "evidenceId": evidence_key, "inputs": inputs,
                        "limitations": note, "source": source})

    # First complete carbohydrate and fiber for fresh ingredients.
    for food in foods.values():
        if food["per100g"]["fiberG"] is None or food["per100g"]["carbohydrateG"] is None:
            ev_key = sr_evidence(SR_MATCHES[food["id"]])
            vals = evidence[ev_key]["per100g"]
            if food["per100g"]["fiberG"] is None:
                add(food, "fiberG", vals["fiberG"], "proxy_estimate", ev_key,
                    "USDA raw-food reference transfer. Species, cultivar and sampled batch may differ. Explicit source zeros are retained; absence is never filled as zero.")
            if food["per100g"]["carbohydrateG"] is None:
                total, fiber = vals["carbohydrateG"], vals["fiberG"]
                if total < fiber:
                    raise ValueError("Negative proxy available carbohydrate")
                add(food, "carbohydrateG", total - fiber, "proxy_available_carbohydrate", ev_key,
                    "Approximate available carbohydrate = USDA total carbohydrate minus fiber, transferred from a raw-food proxy. Not a laboratory result or exact species/cultivar match.",
                    {"totalCarbohydrateG": total, "fiberG": fiber})

    for food in foods.values():
        if food["per100g"]["sodiumMg"] is not None:
            continue
        if food["id"] in PANGANKU_MATCHES:
            code = PANGANKU_MATCHES[food["id"]]
            ev_key = "panganku-" + code
            evidence[ev_key] = read_panganku(panganku_cache / (code + ".html"), code)
            method = "proxy_estimate" if food["id"] in BROAD_LOCAL_MATCHES else "reference_supplement"
            add(food, "sodiumMg", evidence[ev_key]["per100g"]["sodiumMg"], method, ev_key,
                "Panganku source explicitly reports sodium mg per100g edible portion. This is a second reference sample, not the SMILING/TKPSI assay. Food variety, species, cut, salt and recipe may differ; publication needs review.")
        else:
            # Explicitly broad dish proxies; no sodium is invented from appearance.
            special = {"idn-ikan-mas-pepes": "GP021"}
            if food["id"] in special:
                code = special[food["id"]]; ev_key = "panganku-" + code
                evidence[ev_key] = read_panganku(panganku_cache / (code + ".html"), code)
            elif food["id"] in FNDDS_MATCHES:
                ev_key = fndds_evidence(FNDDS_MATCHES[food["id"]])
            else:
                code = {"idn-nasi-jagung-kering": "170288", "tkpsi-sagu": "169717"}.get(food["id"], SR_MATCHES.get(food["id"]))
                ev_key = sr_evidence(code)
            add(food, "sodiumMg", evidence[ev_key]["per100g"]["sodiumMg"], "proxy_estimate", ev_key,
                "Low-specificity food/recipe proxy. Salt, sauces, species and moisture differ; may substantially under- or overestimate the local dish. Do not use to classify a dish as low-sodium or medically safe.")

    for food in foods.values():
        if food["per100g"]["sugarsG"] is not None:
            continue
        code = food["id"].removeprefix("mext-")
        if food["id"].startswith("mext-") and code in carbs:
            rownum, row = carbs[code]
            # Sum only the six sugars in the USDA NLEA definition, not starch/total carbohydrate.
            raw = dict(zip(("glucose", "fructose", "galactose", "sucrose", "maltose", "lactose"), row[7:13]))
            parsed = {k: number(v) for k, v in raw.items()}
            known = [v for v in parsed.values() if v is not None]
            if not known:
                raise ValueError("No quantified MEXT sugar components")
            ev_key = "mext-carbs-" + code
            evidence[ev_key] = {"url": CARBS_URL, "itemRef": f"MEXT 2023 corrected 2026-03-27 carbohydrate table; sheet 表全体; row={rownum}; food code={code}; {row[3]}",
                "rawSugarComponentsG": raw, "upstreamSha256": digest(mext_xlsx.read_bytes())}
            add(food, "sugarsG", sum(known), "partial_sugar_sum_estimate", ev_key,
                "Sum of quantified glucose, fructose, galactose, sucrose, maltose and lactose. Missing and Tr components remain unquantified; their omitted contribution makes this a partial-sum estimate, not an exact total or proof of zero sugar. Trehalose, starch and polyols are excluded for USDA-NLEA comparability. MEXT parenthesized component estimates remain in raw metadata.",
                {"componentsG": parsed, "omittedComponents": [k for k, v in parsed.items() if v is None]})
            continue
        if food["id"] in FNDDS_MATCHES:
            ev_key = fndds_evidence(FNDDS_MATCHES[food["id"]])
        else:
            code = {"idn-nasi-jagung-kering": "170288", "tkpsi-sagu": "169717",
                    "tkpsi-ikan-bandeng": "175176", "tkpsi-ikan-tongkol": "175159",
                    "tkpsi-kangkung-segar": "168462"}.get(food["id"], SR_MATCHES.get(food["id"]))
            ev_key = sr_evidence(code)
        vals = evidence[ev_key]["per100g"]
        sugar, carb, target_carb = vals["sugarsG"], vals["carbohydrateG"], food["per100g"]["carbohydrateG"]
        if carb == 0 and sugar == 0:
            result = 0
        elif carb > 0 and 0 <= sugar <= carb:
            result = target_carb * sugar / carb
        else:
            raise ValueError("Invalid proxy sugar fraction")
        add(food, "sugarsG", result, "proxy_sugar_fraction_estimate", ev_key,
            "Target carbohydrate times proxy sugars/total-carbohydrate ratio; this controls mass-basis mismatch without pretending recipes match. Target available versus proxy total carbohydrate definitions differ. Fermentation, ripeness, sauces and added sugar can change this ratio substantially; zero from a proxy is an estimate, not a sugar-free claim.",
            {"targetCarbohydrateG": target_carb, "proxySugarsG": sugar, "proxyTotalCarbohydrateG": carb})

    for food in foods.values():
        if food["per100g"]["energyKcal"] is not None:
            continue
        vals = food["per100g"]
        inputs = {k: vals[k] for k in ("carbohydrateG", "proteinG", "fatG", "fiberG")}
        result = 4 * vals["carbohydrateG"] + 4 * vals["proteinG"] + 9 * vals["fatG"] + 2 * vals["fiberG"]
        ev_key = "energy-" + food["id"]
        evidence[ev_key] = {"url": FAO_URL, "itemRef": f"FAO food energy conversion factors; target {food['id']}; 4P+9F+4 available C+2 dietary fiber; macro inputs in completion record",
                           "inputs": inputs, "macroSourceIds": {k: food["nutrientSourceIds"][k] for k in inputs}}
        add(food, "energyKcal", result, "energy_factor_estimate", ev_key,
            "Estimated kcal = 4*available carbohydrate + 4*protein + 9*fat + 2*fiber. Existing TKPSI macros are retained; filled carbohydrate/fiber may themselves be proxies. No calorimetry, food-specific factors, polyol/alcohol or organic-acid adjustment. Formula reference does not validate the target food composition.", inputs)

    for food in foods.values():
        if any(food["per100g"][k] is None for k in KEYS):
            raise ValueError(f"Still missing: {food['id']}")
    write_json(IMPORT / "nutrient-completions.json", {"schemaVersion": 1, "status": "draft", "retrievedOn": "2026-10-15",
               "policy": "Reference supplements and explicit estimates only; no VLM-generated nutrients. Numeric completeness is not analytical validation or clinical suitability.",
               "evidence": evidence, "entries": entries})
    print(f"Prepared {len(entries)} nutrient completions; original non-null nutrients preserved")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sr-zip", type=Path, required=True)
    parser.add_argument("--fndds-xlsx", type=Path, required=True)
    parser.add_argument("--mext-carbs-xlsx", type=Path, required=True)
    parser.add_argument("--panganku-cache-dir", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.sr_zip, args.fndds_xlsx, args.mext_carbs_xlsx, args.panganku_cache_dir)

"""Snapshot independently sourced USDA SR Legacy nutrients for the A6 experiment."""
import hashlib
import json
import csv
import io
import urllib.request
import zipfile

from download_datasets import ROOT, save_bytes
from evaluate_predictions import measurement
from run_evaluation import json_bytes, utc_now

# Independent food definitions and aliases are fixed before A6 outputs are read.
FOODS = [
    ("raspberries", "Raspberries, raw", ["raspberries", "raspberry", "fresh raspberries", "raw raspberries", "raspberries raw"]),
    ("watermelon", "Watermelon, raw", ["watermelon", "raw watermelon", "watermelon raw", "watermelon cubes", "fresh watermelon"]),
    ("cantaloupe", "Melons, cantaloupe, raw", ["cantaloupe", "cantaloupe melon", "cantaloupe cubes", "raw cantaloupe", "cantaloupe raw", "orange melon"]),
    ("baked-potato", "Potatoes, baked, flesh and skin, without salt", ["baked potato", "baked potatoes", "roasted potato", "roasted potatoes", "potatoes baked", "baked potato with skin"]),
    ("boiled-potato", "Potatoes, boiled, cooked without skin, flesh, without salt", ["boiled potato", "boiled potatoes", "potatoes boiled", "cooked potato", "cooked potatoes"]),
    ("sweet-potato", "Sweet potato, cooked, baked in skin, flesh, without salt", ["baked sweet potato", "roasted sweet potato", "cooked sweet potato", "sweet potatoes baked", "roasted sweet potato cubes", "sweet potato"]),
    ("cooked-rice", "Rice, white, long-grain, regular, enriched, cooked", ["cooked white rice", "white rice cooked", "cooked rice", "steamed white rice", "steamed rice", "white rice"]),
    ("apple", "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)", ["apple", "apples", "raw apple", "raw apples", "apple chunks"]),
]
NUTRIENTS = {1008:("energy_kcal","KCAL"),1003:("protein_g","G"),1005:("carbohydrate_g","G"),1004:("fat_g","G")}
ARCHIVE_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"


def csv_rows(archive, name):
    member = next(n for n in archive.namelist() if n.endswith("/" + name))
    with archive.open(member) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig"))


def main():
    cache=ROOT/"data/nutrition-catalog"
    cache.mkdir(parents=True, exist_ok=True)
    path=cache/ARCHIVE_URL.rsplit("/",1)[1]
    if not path.exists():
        temporary=path.with_suffix(".download")
        urllib.request.urlretrieve(ARCHIVE_URL, temporary)
        temporary.replace(path)
    with path.open("rb") as stream:
        archive_sha=hashlib.file_digest(stream,"sha256").hexdigest()
    foods=[]
    with zipfile.ZipFile(path) as archive:
        definitions={r["description"].casefold():r for r in csv_rows(archive,"food.csv")}
        nutrients={int(r["id"]):r for r in csv_rows(archive,"nutrient.csv")}
        selected={int(definitions[description.casefold()]["fdc_id"]): (slug,description,aliases)
                  for slug,description,aliases in FOODS}
        values_by_id={i:{name:None for name,unit in NUTRIENTS.values()} for i in selected}
        for entry in csv_rows(archive,"food_nutrient.csv"):
            food_id=int(entry["fdc_id"]); nutrient_id=int(entry["nutrient_id"])
            spec=NUTRIENTS.get(nutrient_id)
            if food_id in selected and spec:
                if nutrients[nutrient_id]["unit_name"].upper()!=spec[1]:
                    raise ValueError("Unexpected USDA nutrient unit")
                values_by_id[food_id][spec[0]]=measurement(float(entry["amount"]))
    for food_id,(slug,description,aliases) in selected.items():
        food=definitions[description.casefold()]
        values=values_by_id[food_id]
        if any(value is None for value in values.values()):
            raise ValueError(f"Missing source nutrient for {description}")
        foods.append({"canonical_name":food["description"],"aliases":aliases,"basis_grams":100,
            "per_100g":values,"source":{"provider":"USDA FoodData Central","fdc_id":food_id,
                "data_type":"SR Legacy","publication_date":food["publication_date"],
                "url":f"https://fdc.nal.usda.gov/food-details/{food_id}/nutrients",
                "archive_url":ARCHIVE_URL,"archive_sha256":archive_sha,"release":"April 2018"}})
        print("Sourced",food_id,food["description"],values,flush=True)
    if not foods: raise ValueError("No sourced foods; do not create an invented catalog")
    data={"version":"usda-sr-legacy-ablation-v1","created_at":utc_now(),"license":"CC0-1.0",
          "foods":foods,"units":{"energy_kcal":"kcal","protein_g":"g","carbohydrate_g":"g","fat_g":"g"},
          "limitations":["Experimental snapshot, not an approved T31 production catalog.",
                         "Aliases select reference preparations; actual recipe/oil/water content can differ.",
                         "No TKPI values are invented; unsupported Indonesian dishes remain unmatched.",
                         "No Nutrition5k or LeFood reference nutrient/weight labels were used to make this catalog."]}
    path=ROOT/"catalogs/usda-sr-legacy-ablation-v1.json"
    save_bytes(path,json_bytes(data))
    print("Saved",path,flush=True)


if __name__=="__main__":main()

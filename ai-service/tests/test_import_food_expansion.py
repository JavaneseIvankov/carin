"""Unit/basis safeguards for official nutrition source extraction; no network."""

import importlib.util
import copy
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "import_food_expansion", Path(__file__).resolve().parents[1] / "scripts/import_food_expansion.py"
)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


def mfds_page(basis="100g", sodium="1,200.00㎎", sugar="-"):
    cells = (("에너지", "123.00㎉"), ("탄수화물", "20.56g"), ("단백질", "3.04g"),
             ("지방", "3.13g"), ("식이섬유", "0.00g"), ("당류", sugar), ("나트륨", sodium))
    return f"<dt>영양성분 함량 기준량</dt><dd>{basis}</dd>" + "".join(
        f'<span><i class="hidden">영양성분</i>{label}</span>'
        f'<span><i class="hidden">100g당 함량</i>{value}</span>' for label, value in cells)


def test_mfds_keeps_mg_distinct_from_g_and_missing_distinct_from_zero():
    values, raw, metadata = importer.parse_mfds(mfds_page())
    assert values["sodiumMg"] == 1200
    assert values["energyKcal"] == 123
    assert values["fiberG"] == 0
    assert values["sugarsG"] is None
    assert raw["sugarsG"] == "-"
    assert metadata["영양성분 함량 기준량"] == "100g"


@pytest.mark.parametrize("basis", ["100mL", "1 serving", "650g"])
def test_mfds_rejects_non_mass_or_non_100g_basis(basis):
    with pytest.raises(ValueError, match="100g basis"):
        importer.parse_mfds(mfds_page(basis=basis))


def test_mfds_rejects_wrong_sodium_unit_and_duplicate_cell():
    with pytest.raises(ValueError, match="unexpected unit"):
        importer.parse_mfds(mfds_page(sodium="1.20g"))
    with pytest.raises(ValueError, match="duplicate"):
        importer.parse_mfds(mfds_page() + '<span><i class="hidden">영양성분</i>당류</span>'
                            '<span><i class="hidden">100g당 함량</i>0.00g</span>')


def test_mext_estimate_and_trace_notation():
    assert importer.number("(1.3)") == 1.3
    assert importer.number("Tr") is None
    assert importer.number("(Tr)") is None
    assert importer.number("-") is None
    assert importer.number(0) == 0
    for invalid in ("unknown", "(1.3", "1.3)", -1, float("nan"), True):
        with pytest.raises(ValueError):
            importer.number(invalid)


def completion_fixture():
    completion = importer.read_json(importer.IMPORT / "nutrient-completions.json")
    entry = copy.deepcopy(next(e for e in completion["entries"] if e["estimated"]))
    food = {"id": entry["foodId"], "per100g": {key: None for key in importer.KEYS},
            "nutrientSourceIds": {key: None for key in importer.KEYS}}
    food["per100g"]["proteinG"] = 7.5
    food["nutrientSourceIds"]["proteinG"] = "original-protein-source"
    return {"foods": [food]}, {"sources": []}, {
        "status": "draft", "entries": [entry],
        "evidence": {entry["evidenceId"]: completion["evidence"][entry["evidenceId"]]}}


def test_completion_preserves_existing_reference_and_is_repeatable():
    catalog, dataset, completion = completion_fixture()
    importer.apply_completions(catalog, dataset, completion)
    assert catalog["foods"][0]["per100g"]["proteinG"] == 7.5
    assert catalog["foods"][0]["nutrientSourceIds"]["proteinG"] == "original-protein-source"
    once = copy.deepcopy((catalog, dataset))
    importer.apply_completions(catalog, dataset, completion)
    assert (catalog, dataset) == once


def test_completion_rejects_overwriting_reference_or_hiding_estimate():
    catalog, dataset, completion = completion_fixture()
    key = completion["entries"][0]["nutrient"]
    catalog["foods"][0]["per100g"][key] = 12
    catalog["foods"][0]["nutrientSourceIds"][key] = "existing-reference"
    with pytest.raises(ValueError, match="overwrite"):
        importer.apply_completions(catalog, dataset, completion)
    catalog, dataset, completion = completion_fixture()
    completion["entries"][0]["source"]["title"] = "Unlabeled estimate"
    with pytest.raises(ValueError, match="explicitly labeled"):
        importer.apply_completions(catalog, dataset, completion)


def test_completion_rejects_duplicate_cell_and_missing_evidence():
    catalog, dataset, completion = completion_fixture()
    completion["entries"].append(copy.deepcopy(completion["entries"][0]))
    with pytest.raises(ValueError, match="Duplicate"):
        importer.apply_completions(catalog, dataset, completion)
    catalog, dataset, completion = completion_fixture()
    completion["evidence"] = {}
    with pytest.raises(ValueError, match="Missing completion evidence"):
        importer.apply_completions(catalog, dataset, completion)


def test_completion_numeric_coverage_does_not_hide_estimated_sugars():
    catalog = importer.read_json(importer.DATA / "catalog.json")
    completion = importer.read_json(importer.IMPORT / "nutrient-completions.json")
    assert all(all(food["per100g"][key] is not None for key in importer.KEYS) for food in catalog["foods"])
    assert all(entry["estimated"] for entry in completion["entries"] if entry["nutrient"] == "sugarsG")
    foods = {food["id"]: food for food in catalog["foods"]}
    for entry in completion["entries"]:
        if entry["method"] == "energy_factor_estimate":
            values = entry["inputs"]
            expected = round(4 * values["carbohydrateG"] + 4 * values["proteinG"]
                             + 9 * values["fatG"] + 2 * values["fiberG"], 2)
            assert foods[entry["foodId"]]["per100g"]["energyKcal"] == expected

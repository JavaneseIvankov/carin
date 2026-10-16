"""Regression gates for draft health policies, not clinical efficacy tests."""

import copy

import pytest

from test_validate_data_artifacts import ROOT, validator


def bundle():
    return validator.load_bundle(ROOT / "data")


def rule(data, slug):
    return next(r for r in data["rules"]["rules"] if r["id"] == "rule." + slug)


def test_draft_condition_definitions_do_not_claim_published_personalization():
    data = bundle()
    assert validator.validate_bundle(data, ROOT.parent) == []
    manifest = data["capability-manifest"]
    assert manifest["conditions"] == data["rules"]["conditions"]
    assert all(not c["personalizationSupported"] for c in manifest["conditions"])
    assert manifest["publicationStatus"] == "unpublished"
    assert manifest["supportedPhotoFoodIds"] == manifest["nutrients"] == []
    assert all(not r["ruleBody"]["enabled"] for r in data["rules"]["rules"])
    assert all(a["status"] == "draft" for a in data["review-metadata"]["artifacts"]["rulesById"].values())


@pytest.mark.parametrize("mutation, expected", [
    ("enable", "nutrition policy body"),
    ("allow_estimates", "nutrition policy body"),
    ("missing_context_guard", "critical-missing guards"),
    ("unknown_profile_field", "wire contract"),
    ("wrong_denominator", "daily reference calculation"),
    ("one_way_conflict", "symmetric"),
    ("missing_predicate", "one predicate"),
])
def test_rejects_unsafe_or_inconsistent_draft_policies(mutation, expected):
    data = bundle()
    target = rule(data, "general-sodium-context")
    if mutation == "enable":
        target["ruleBody"]["enabled"] = True
    elif mutation == "allow_estimates":
        target["ruleBody"]["dataQuality"]["estimatedNutrientPolicy"] = "use_as_exact"
    elif mutation == "missing_context_guard":
        rule(data, "ckd-protein-plan-guard")["criticalMissingFields"] = []
    elif mutation == "unknown_profile_field":
        target["requiredProfileFields"].append("bloodGlucoseMgDl")
    elif mutation == "wrong_denominator":
        target["ruleBody"]["calculation"]["denominator"] = 500
    elif mutation == "one_way_conflict":
        rule(data, "gout-confirmed-organ-meat")["ruleBody"]["conflictsWith"] = []
    elif mutation == "missing_predicate":
        rule(data, "allergy-confirmed-ingredient")["ruleBody"]["contextPredicates"] = []
    errors = validator.validate_bundle(data, ROOT.parent)
    assert any(expected in e for e in errors), errors


def test_unpublished_manifest_still_rejects_real_support_claim():
    data = bundle()
    data["rules"]["conditions"][0]["personalizationSupported"] = True
    data["capability-manifest"]["conditions"] = copy.deepcopy(data["rules"]["conditions"])
    errors = validator.validate_bundle(data, ROOT.parent)
    assert any("unpublished manifest" in error for error in errors)
    assert any("disabled draft" in error for error in errors)


def test_daily_references_do_not_become_meal_limits_or_total_sugar_limits():
    data = bundle()
    sodium = rule(data, "general-sodium-context")["ruleBody"]
    assert sodium["reference"]["window"] == "day"
    assert sodium["calculation"]["resultUse"] == "context_only_not_a_per_meal_cutoff"
    sugar = rule(data, "general-free-sugar-definition")
    assert "sugarsG" not in sugar["requiredNutrients"]
    assert sugar["ruleBody"]["reference"]["nutrient"] == "freeSugarsG"
    assert sugar["ruleBody"]["output"]["mode"] == "insufficient_information"
    allergy = rule(data, "allergy-confirmed-ingredient")["ruleBody"]
    assert {"field": "verifiedIngredientAllergenMatch", "operator": "is_true"} in allergy["contextPredicates"]

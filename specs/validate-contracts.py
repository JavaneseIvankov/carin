#!/usr/bin/env python3
"""Validate the Carin OpenAPI documents, fixtures, and nutrition invariants.

Dependencies: PyYAML, jsonschema, openapi-spec-validator.
No network resolution is allowed. This verifies specification artifacts, not
the application or real model quality.
"""

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlsplit

from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
import yaml


ROOT = Path(__file__).resolve().parent
CONTRACTS = ROOT / "contracts"
NUTRIENTS = (
    "energyKcal", "carbohydrateG", "proteinG", "fatG", "fiberG", "sugarsG", "sodiumMg"
)
TOLERANCE = Decimal("0.000001")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def walk(value):
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def check_refs(path, document, documents):
    count = 0
    for node in walk(document):
        if not isinstance(node, dict) or "$ref" not in node:
            continue
        target = urlsplit(urljoin(path.as_uri(), node["$ref"]))
        require(target.scheme == "file", "Non-local schema reference is prohibited")
        target_path = Path(unquote(target.path)).resolve()
        require(target_path in documents, f"Unknown referenced contract: {target_path}")
        value = documents[target_path]
        if target.fragment:
            require(target.fragment.startswith("/"), "Only JSON Pointer refs are used")
            for part in unquote(target.fragment)[1:].split("/"):
                part = part.replace("~1", "/").replace("~0", "~")
                value = value[int(part)] if isinstance(value, list) else value[part]
        count += 1
    return count


def same_number(actual, expected, message):
    if expected is None:
        require(actual is None, message)
    else:
        require(actual is not None, message)
        require(abs(Decimal(str(actual)) - expected) <= TOLERANCE, message)


def check_analysis(result):
    components = result["components"]
    component_ids = {c["id"] for c in components}
    sources = {s["id"]: s for s in result["sources"]}
    require(len(component_ids) == len(components), "Duplicate component ID")
    require(len(sources) == len(result["sources"]), "Duplicate source ID")
    if result["dataMode"] == "real":
        require(all(s["kind"] != "synthetic" for s in sources.values()),
                "Synthetic sources cannot be promoted to real mode")
    for component in components:
        portion = component["portion"]
        grams = portion["grams"]
        require(set(component["sourceIds"]) <= sources.keys(), "Unknown component source")
        if portion["sourceId"] is not None:
            require(portion["sourceId"] in sources, "Unknown portion source")
        if component["matchStatus"] == "matched":
            require(component["catalogFoodId"] is not None, "Matched food needs catalog ID")
        else:
            require(component["catalogFoodId"] is None, "Unmatched food has catalog ID")
            require(all(v is None for v in component["nutrients"].values()),
                    "Unmatched food cannot have numeric nutrition")
        if grams is not None:
            require(portion["quantity"] is not None and portion["unit"] is not None,
                    "Known grams need visible quantity/unit")
            require(portion["basis"] is not None and portion["sourceId"] is not None,
                    "Known grams need traceable portion basis")
            if portion["unit"] == "g":
                same_number(grams, Decimal(str(portion["quantity"])), "Gram portion mismatch")
            else:
                require(portion["servingId"] is not None, "Serving portion needs ID")
        for key in NUTRIENTS:
            basis = component["per100g"][key]
            source_id = component["nutrientSourceIds"][key]
            if basis is None:
                require(source_id is None, f"Unknown {key} should not claim a source value")
            else:
                require(source_id in sources, f"Missing source for {key}")
                require(source_id in component["sourceIds"], f"Source not linked to component: {key}")
            expected = None if grams is None or basis is None else (
                Decimal(str(basis)) * Decimal(str(grams)) / Decimal(100)
            )
            same_number(component["nutrients"][key], expected, f"Bad portion math: {key}")
    for key in NUTRIENTS:
        values = [c["nutrients"][key] for c in components if c["nutrients"][key] is not None]
        expected = sum((Decimal(str(v)) for v in values), Decimal(0)) if values else None
        same_number(result["totals"][key], expected, f"Bad total/null handling: {key}")
        require(result["coverage"][key] == {
            "knownComponentCount": len(values), "totalComponentCount": len(components)
        }, f"Bad coverage: {key}")
    for attention in result["attentions"]:
        require(set(attention["componentIds"]) <= component_ids, "Unknown attention component")
        require(set(attention["sourceIds"]) <= sources.keys(), "Unknown attention source")
    for limitation in result["limitations"]:
        require(set(limitation["componentIds"]) <= component_ids, "Unknown limitation component")
    if any(l["critical"] for l in result["limitations"]):
        require(result["overallAttention"] == "insufficient_information",
                "Critical gap cannot be hidden by a positive/definitive overall status")
    if result["supportStatus"] == "complete":
        require(all(c["matchStatus"] == "matched" and c["portion"]["grams"] is not None
                    and all(c["nutrients"][k] is not None for k in NUTRIENTS[:4])
                    for c in components), "Complete result lacks core data")
    if result["supportStatus"] == "unrecognized":
        require(all(c["matchStatus"] != "matched" for c in components),
                "Unrecognized result claims matched food")
        require(all(v is None for v in result["totals"].values()),
                "Unrecognized result claims numeric totals")


def check_job(job):
    if job["targetType"] == "scan":
        require(job["scanId"] == job["targetId"], "Scan target mismatch")
    if job["status"] == "completed":
        require(job["resultId"] is not None and job["result"] is not None
                and job["error"] is None, "Completed job needs valid result only")
        require(job["result"]["operationId"] == job["id"], "Job/result operation mismatch")
        check_analysis(job["result"])
    else:
        require(job["resultId"] is None and job["result"] is None,
                "Non-completed job cannot publish a result")
    if job["status"] == "failed":
        require(job["error"] is not None and job["finishedAt"] is not None,
                "Failed job needs error and terminal time")
    if job["status"] in ("queued", "processing"):
        require(job["error"] is None and job["finishedAt"] is None,
                "Active job has terminal metadata")


def main():
    documents = {p.resolve(): yaml.safe_load(p.read_text())
                 for p in sorted(CONTRACTS.glob("*.openapi.yaml"))}
    require(len(documents) == 2, "Expected app and AI contracts")
    references = 0
    operation_ids = set()
    for path, document in documents.items():
        require(document["openapi"] == "3.1.1", "Unexpected OpenAPI version")
        references += check_refs(path, document, documents)
        validate(document, base_uri=path.as_uri())
        for name, schema in document["components"]["schemas"].items():
            Draft202012Validator.check_schema(schema)
        for route, methods in document["paths"].items():
            for method, operation in methods.items():
                if method not in ("get", "post", "put", "patch", "delete"):
                    continue
                operation_id = operation["operationId"]
                require(operation_id not in operation_ids, f"Duplicate operation ID: {operation_id}")
                operation_ids.add(operation_id)
                names = {p["name"] for p in operation.get("parameters", []) if p["in"] == "path"}
                require(names == set(re.findall(r"\{([^}]+)\}", route)),
                        f"Path parameter mismatch: {operation_id}")
    registry = Registry().with_resources(
        (p.as_uri(), Resource.from_contents(d, default_specification=DRAFT202012))
        for p, d in documents.items()
    )
    fixtures = {}
    for path in sorted((ROOT / "fixtures" / "ai").glob("*.json")):
        data = json.loads(path.read_text())
        is_job = path.name == "job-failed.json"
        filename = "app-api.openapi.yaml" if is_job else "ai-service.openapi.yaml"
        schema_name = "AnalysisJob" if is_job else "AnalysisResult"
        schema_uri = (CONTRACTS / filename).as_uri() + "#/components/schemas/" + schema_name
        validator = Draft202012Validator({"$ref": schema_uri}, registry=registry,
                                        format_checker=FormatChecker())
        validator.validate(data)
        (check_job if is_job else check_analysis)(data)
        if not is_job:
            require(data["dataMode"] == "synthetic", "Fixture lacks explicit synthetic marker")
            require(all(s["kind"] == "synthetic" for s in data["sources"]),
                    "Fixture appears to claim a real source")
        fixtures[path.name] = data
    require(len(fixtures) == 5, "Expected five scenario fixtures")
    complete = fixtures["analysis-complete.json"]
    correction = fixtures["correction-complete.json"]
    for key in NUTRIENTS:
        same_number(correction["totals"][key], Decimal(str(complete["totals"][key])) / 2,
                    f"Half portion regression: {key}")
    require(correction["components"][0]["per100g"] == complete["components"][0]["per100g"],
            "Correction changed source basis")
    probes = [deepcopy(complete), deepcopy(fixtures["analysis-partial.json"]), deepcopy(complete)]
    probes[0]["totals"]["energyKcal"] += 1
    probes[1]["components"][1]["nutrients"]["sodiumMg"] = 0
    probes[2]["components"][0]["nutrientSourceIds"]["proteinG"] = "missing-source"
    for probe in probes:
        try:
            check_analysis(probe)
        except ValueError:
            continue
        raise ValueError("Validator failed to reject a bad math/null/provenance probe")
    prd = ROOT.parent.parent / "resources" / "Carin_Feature_PRD.md"
    if prd.exists():
        required_ac = set(re.findall(r"AC-[A-Z]+-\d+", prd.read_text()))
        mapped_ac = set(re.findall(r"AC-[A-Z]+-\d+",
                                  (ROOT / "05-verification-and-deployment.md").read_text()))
        require(required_ac <= mapped_ac, f"Unmapped AC: {sorted(required_ac - mapped_ac)}")
        print(f"AC traceability: {len(required_ac)} source criteria mapped")
    print(f"PASS: {len(documents)} OpenAPI documents, {len(operation_ids)} operations, "
          f"{references} local refs, {len(fixtures)} fixtures; "
          "math/coverage/provenance and 3 negative probes verified")


if __name__ == "__main__":
    main()

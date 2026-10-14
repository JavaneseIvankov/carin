#!/usr/bin/env python3
"""Score recorded model predictions; this does not invoke a model or service."""

import argparse
import json
import math
from pathlib import Path

from download_datasets import METRICS


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def measurement(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Measurement must be numeric or null: {value!r}")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid measurement: {value!r}")
    return float(value)


def score(references, predictions):
    ids = {row["sample_id"] for row in references}
    if len(ids) != len(references) or not references:
        raise ValueError("Manifest must contain unique, nonempty sample IDs")
    if len({row["dataset"] for row in references}) != 1:
        raise ValueError("Score each dataset separately")
    indexed = {}
    for row in predictions:
        sample_id = row["sample_id"]
        if sample_id not in ids or sample_id in indexed:
            raise ValueError(f"Unknown or duplicate prediction ID: {sample_id}")
        if row.get("status") not in ("ok", "error"):
            raise ValueError(f"Invalid prediction status: {sample_id}")
        if row["status"] == "ok":
            values = row.get("prediction")
            if not isinstance(values, dict):
                raise ValueError(f"Missing prediction object: {sample_id}")
            for key in METRICS:
                measurement(values.get(key))
        indexed[sample_id] = row
    result = {
        "dataset": references[0]["dataset"],
        "sample_count": len(references),
        "submitted_count": len(indexed),
        "missing_response_count": len(ids - indexed.keys()),
        "error_response_count": sum(row["status"] == "error" for row in indexed.values()),
        "ok_response_count": sum(row["status"] == "ok" for row in indexed.values()),
        "metrics": {},
        "limitations": ["Numerical errors cover valid predictions only; read with coverage",
                        "Reference availability differs by dataset",
                        "Recognition and clinical-policy correctness are not scored here"],
    }
    for key in METRICS:
        reference_count, errors = 0, []
        for row in references:
            truth = measurement(row["reference"].get(key))
            if truth is None:
                continue
            reference_count += 1
            prediction = indexed.get(row["sample_id"])
            if prediction is None or prediction["status"] != "ok":
                continue
            value = measurement(prediction["prediction"].get(key))
            if value is not None:
                errors.append(value - truth)
        result["metrics"][key] = {
            "reference_count": reference_count,
            "valid_prediction_count": len(errors),
            "coverage": len(errors) / reference_count if reference_count else None,
            "mae": sum(abs(error) for error in errors) / len(errors) if errors else None,
            "mean_signed_error": sum(errors) / len(errors) if errors else None,
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = score(read_jsonl(args.manifest), read_jsonl(args.predictions))
    rendered = json.dumps(result, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")


if __name__ == "__main__":
    main()

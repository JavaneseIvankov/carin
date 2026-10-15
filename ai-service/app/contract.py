from __future__ import annotations

import copy
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker

from .errors import ContractViolation, PayloadValidationError


CONTRACT_PATH = Path(__file__).resolve().parents[2] / "specs" / "contracts" / "ai-service.openapi.yaml"
OPENAPI_DOCUMENT: dict[str, Any] = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


def _pointer(root: Any, reference: str) -> Any:
    if not reference.startswith("#/"):
        raise ContractViolation("Only local OpenAPI references are supported")
    current = root
    for token in reference[2:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        current = current[token]
    return current


def _resolve_local_refs(value: Any, stack: frozenset[str] = frozenset()) -> Any:
    if isinstance(value, list):
        return [_resolve_local_refs(item, stack) for item in value]
    if not isinstance(value, dict):
        return value
    if "$ref" in value:
        reference = value["$ref"]
        if reference in stack:
            raise ContractViolation("Recursive OpenAPI schema references are unsupported")
        target = _resolve_local_refs(_pointer(OPENAPI_DOCUMENT, reference), stack | {reference})
        siblings = {key: item for key, item in value.items() if key != "$ref"}
        return {**target, **_resolve_local_refs(siblings, stack)}
    return {key: _resolve_local_refs(item, stack) for key, item in value.items()}


@lru_cache(maxsize=None)
def schema_validator(name: str) -> Draft202012Validator:
    try:
        schema = OPENAPI_DOCUMENT["components"]["schemas"][name]
    except KeyError as exc:
        raise ContractViolation(f"Unknown contract schema: {name}") from exc
    resolved = _resolve_local_refs(copy.deepcopy(schema))
    Draft202012Validator.check_schema(resolved)
    return Draft202012Validator(resolved, format_checker=FormatChecker())


def validate_payload(name: str, payload: Any) -> None:
    errors = sorted(schema_validator(name).iter_errors(payload), key=lambda item: list(item.absolute_path))
    if errors:
        path = ".".join(str(part) for part in errors[0].absolute_path) or "$"
        raise PayloadValidationError(path)

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ServiceError(Exception):
    status_code: int
    code: str
    message: str
    retryable: bool = False
    details: dict[str, Any] = field(default_factory=dict)
    retry_after: int | None = None


class PayloadValidationError(Exception):
    def __init__(self, field_path: str) -> None:
        self.field_path = field_path


class ContractViolation(Exception):
    pass

from __future__ import annotations

import math
import time

from fastapi import Request

from .errors import ServiceError


class MemoryRateLimiter:
    """One fixed-window API quota for this service process."""

    def __init__(self, clock=time.monotonic) -> None:
        self.clock = clock
        self.window_seconds = 0
        self.window_ends_at = 0.0
        self.count = 0

    async def hit(self, limit: int, window: int) -> int:
        now = self.clock()
        if self.window_seconds != window or now >= self.window_ends_at:
            self.window_seconds = window
            self.window_ends_at = now + window
            self.count = 0
        self.count += 1
        if self.count > limit:
            return max(1, math.ceil(self.window_ends_at - now))
        return 0


def rate_limiter(request: Request) -> MemoryRateLimiter:
    limiter = getattr(request.app.state, "rate_limiter", None)
    if limiter is None:
        limiter = MemoryRateLimiter()
        request.app.state.rate_limiter = limiter
    return limiter


async def enforce_rate(limiter: MemoryRateLimiter, limit: int, window: int) -> None:
    retry_after = await limiter.hit(limit, window)
    if retry_after:
        raise ServiceError(429, "RATE_LIMITED", "Batas request API tercapai. Coba kembali nanti.", retryable=True, retry_after=retry_after)

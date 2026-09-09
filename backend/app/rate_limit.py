"""
Minimal in-memory fixed-window rate limiter.

Good enough for a single-process app — no Redis, no external state. Not
safe across multiple worker processes, since each would keep its own
counts, but that matches how this app is run today.
"""
import time
from threading import Lock


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = Lock()

    def check(self, key: str) -> tuple[bool, float]:
        """
        Records a hit for `key` unless it's already at the limit. Returns
        (allowed, retry_after_seconds) — retry_after is only meaningful
        when allowed is False.
        """
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, [])
            cutoff = now - self.window_seconds
            while hits and hits[0] < cutoff:
                hits.pop(0)
            if len(hits) >= self.max_requests:
                return False, self.window_seconds - (now - hits[0])
            hits.append(now)
            return True, 0.0

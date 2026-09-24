"""Fixed-window in-memory rate limiter (prototype-grade; use Redis in prod)."""
import time


class FixedWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allowed(self, key: str, now: float | None = None) -> bool:
        now = now if now is not None else time.time()
        cutoff = now - self.window
        hits = [t for t in self._hits.get(key, []) if t > cutoff]
        if len(hits) >= self.max_requests:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True

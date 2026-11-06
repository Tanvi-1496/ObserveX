import time
from typing import Tuple

RANGE_DURATIONS = {
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "6h": 21600,
    "24h": 86400,
    "7d": 604800,
}

RANGE_STEPS = {
    "5m": 5,
    "15m": 15,
    "1h": 30,
    "6h": 180,
    "24h": 720,
    "7d": 3600,
}

def parse_time_range(range_key: str) -> Tuple[float, float, int]:
    now = time.time()
    duration = RANGE_DURATIONS.get(range_key, 900)
    step = RANGE_STEPS.get(range_key, 15)
    start = now - duration
    return start, now, step

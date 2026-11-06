from typing import List
from app.schemas.base import CamelModel

class MetricPoint(CamelModel):
    time: str
    timestamp: float
    requests: float
    errors: float
    latency: float
    p50: float
    p95: float
    p99: float
    cpu: float
    memory: float

class KpiResponse(CamelModel):
    requests: float
    latency: float
    p95: float
    errors: float
    uptime: float
    activeAlerts: int
    series: List[MetricPoint]

class MetricNameInfo(CamelModel):
    name: str
    type: str  # counter | gauge | histogram

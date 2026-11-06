from typing import List, Optional
from app.schemas.base import CamelModel

class LoadTestConfig(CamelModel):
    endpoints: List[str]
    rps: int
    duration: int
    concurrency: int
    latency: int
    errorRate: float
    cpuSpike: bool

class LoadTestStatus(CamelModel):
    running: bool
    progress: float
    config: Optional[LoadTestConfig] = None
    requestsSent: int = 0
    currentRps: float = 0.0
    currentLatency: float = 0.0
    currentErrors: float = 0.0

class LoadTestRunRecord(CamelModel):
    id: str
    config: LoadTestConfig
    requests: int
    latency: float
    errors: float
    alertsTriggered: int = 0
    createdAt: str

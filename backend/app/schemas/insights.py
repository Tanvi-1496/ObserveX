from typing import Optional
from app.schemas.base import CamelModel

class Insight(CamelModel):
    id: str
    title: str
    endpoint: str
    changePercent: float
    zScore: float
    severity: str  # 'critical' | 'warning' | 'info'
    description: str
    targetUrl: str

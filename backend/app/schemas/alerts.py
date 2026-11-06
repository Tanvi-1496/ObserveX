from typing import Optional
from app.schemas.base import CamelModel

class Alert(CamelModel):
    id: str
    name: str
    severity: str  # 'critical' | 'warning' | 'info'
    endpoint: str
    value: float
    threshold: float
    unit: str
    since: str
    status: str  # 'firing' | 'acknowledged' | 'silenced'
    incidentId: Optional[str] = None

class SilenceRequest(CamelModel):
    minutes: Optional[int] = 60

class AlertRule(CamelModel):
    id: str
    name: str
    query: str
    condition: str  # '>' | '<' | '='
    threshold: float
    duration: str
    severity: str
    enabled: bool

class AlertRuleCreate(CamelModel):
    name: str
    query: str
    condition: str = ">"
    threshold: float
    duration: str = "5m"
    severity: str = "critical"
    enabled: bool = True

class AlertRuleUpdate(CamelModel):
    name: Optional[str] = None
    query: Optional[str] = None
    condition: Optional[str] = None
    threshold: Optional[float] = None
    duration: Optional[str] = None
    severity: Optional[str] = None
    enabled: Optional[bool] = None

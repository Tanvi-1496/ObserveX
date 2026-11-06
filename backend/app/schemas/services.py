from typing import List, Dict, Any, Optional
from app.schemas.base import CamelModel

class Service(CamelModel):
    name: str
    status: str  # 'Up' | 'Down' | 'Degraded'
    version: str
    uptime: str
    lastScrape: str
    ingestion: str
    url: str

class TargetInfo(CamelModel):
    endpoint: str
    state: str  # 'Up' | 'Down'
    lastScrape: str
    duration: str
    error: str

class StackHealthResponse(CamelModel):
    services: List[Service]
    targets: List[TargetInfo]
    ingestionRates: Dict[str, str]

from typing import List
from app.schemas.base import CamelModel

class LogEntry(CamelModel):
    id: str
    timestamp: str
    level: str  # 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
    endpoint: str
    message: str
    traceId: str
    status: int
    duration: float

class LogVolumeBucket(CamelModel):
    time: str
    timestamp: float
    info: int
    warn: int
    error: int

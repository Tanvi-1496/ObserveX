from typing import List, Optional
from app.schemas.base import CamelModel
from app.schemas.logs import LogEntry

class TimelineEvent(CamelModel):
    time: str
    title: str
    description: str
    kind: str  # 'alert' | 'metric' | 'log' | 'trace' | 'action'

class IncidentComment(CamelModel):
    author: str
    text: str
    time: str

class Incident(CamelModel):
    id: str
    title: str
    severity: str  # 'critical' | 'warning' | 'info'
    status: str  # 'Open' | 'Investigating' | 'Resolved'
    endpoint: str
    startedAt: str
    resolvedAt: Optional[str] = None
    assignee: str
    timeline: List[TimelineEvent]
    comments: List[IncidentComment]

class IncidentPatch(CamelModel):
    status: Optional[str] = None
    assignee: Optional[str] = None
    severity: Optional[str] = None

class CommentCreate(CamelModel):
    author: Optional[str] = "Jordan Lee"
    text: str

class ResolveRequest(CamelModel):
    summary: Optional[str] = ""

class CorrelationSignal(CamelModel):
    time: str
    timestamp: float
    errors: float
    latency: float
    logs: int
    traces: int

class RootCause(CamelModel):
    failingEndpoint: str
    frequentError: str
    affectedVersion: str
    confidence: int
    description: str
    relatedTraceIds: List[str]
    sampleLogs: List[LogEntry]

class CorrelationResponse(CamelModel):
    incidentId: str
    signals: List[CorrelationSignal]
    rootCause: RootCause

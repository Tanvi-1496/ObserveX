from typing import Optional, List
from app.schemas.base import CamelModel

class GeneralSettings(CamelModel):
    workspaceName: str = "ObserveX Production"
    defaultEnvironment: str = "prod"
    defaultTimeRange: str = "15m"

class NotificationSettings(CamelModel):
    incidentUpdates: bool = True
    alertDigests: bool = True
    weeklySloReport: bool = False

class TeamMember(CamelModel):
    id: str
    name: str
    email: str
    role: str  # Admin | Editor | Viewer
    status: str  # Active | Invited
    createdAt: str

class TeamMemberCreate(CamelModel):
    name: str
    email: str
    role: str = "Viewer"

class TeamMemberUpdate(CamelModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None

class ApiKey(CamelModel):
    id: str
    name: str
    maskedKey: str
    createdAt: str
    lastUsed: Optional[str] = None

class ApiKeyCreate(CamelModel):
    name: str

class ApiKeyCreatedResponse(CamelModel):
    id: str
    name: str
    apiKey: str
    maskedKey: str
    createdAt: str

class ConnectionTestRequest(CamelModel):
    type: Optional[str] = None
    url: str

class ConnectionTestResponse(CamelModel):
    ok: bool
    latency: int
    message: Optional[str] = None

class EndpointMetricSummary(CamelModel):
    method: str = "GET"
    endpoint: str
    requests: str
    avgLatency: str
    p95Latency: str
    errorRate: str


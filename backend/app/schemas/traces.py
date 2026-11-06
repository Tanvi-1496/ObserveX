from typing import List, Optional, Dict, Any, Union
from app.schemas.base import CamelModel

class Span(CamelModel):
    id: str
    parentId: Optional[str] = None
    operation: str
    service: str
    start: float
    duration: float
    status: str  # 'ok' | 'error'
    tags: Dict[str, Union[str, int, float, bool]]

class Trace(CamelModel):
    id: str
    endpoint: str
    operation: str
    startTime: str
    duration: float
    status: str  # 'ok' | 'error'
    spans: List[Span]

from typing import List, Optional
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Query
# pyrefly: ignore[missing-import]
from sse_starlette.sse import EventSourceResponse

from app.schemas.logs import LogEntry, LogVolumeBucket
from app.services.loki import search_logs, get_logs_volume, live_tail_generator

router = APIRouter(prefix="/api/logs", tags=["logs"])

@router.get("", response_model=List[LogEntry])
async def get_logs(
    range: str = Query(default="15m"),
    level: Optional[str] = Query(default=None),
    endpoint: Optional[str] = Query(default=None),
    text: Optional[str] = Query(default=None),
    traceId: Optional[str] = Query(default=None),
    limit: int = Query(default=100)
):
    return await search_logs(
        range_key=range,
        level=level,
        endpoint=endpoint,
        text=text,
        trace_id=traceId,
        limit=limit
    )

@router.get("/volume", response_model=List[LogVolumeBucket])
async def get_volume(range: str = Query(default="15m")):
    return await get_logs_volume(range_key=range)

@router.get("/tail")
async def tail_logs(
    level: Optional[str] = Query(default=None),
    endpoint: Optional[str] = Query(default=None),
    text: Optional[str] = Query(default=None)
):
    return EventSourceResponse(live_tail_generator(level=level, endpoint=endpoint, text=text))

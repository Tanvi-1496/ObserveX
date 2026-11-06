from typing import List, Optional
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Query, HTTPException

from app.schemas.traces import Trace
from app.services.jaeger import search_traces, get_trace

router = APIRouter(prefix="/api/traces", tags=["traces"])

@router.get("", response_model=List[Trace])
async def list_traces(
    range: str = Query(default="15m"),
    endpoint: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default="all"),
    min: Optional[float] = Query(default=None),
    max: Optional[float] = Query(default=None),
    limit: int = Query(default=100)
):
    return await search_traces(
        range_key=range,
        endpoint=endpoint,
        status=status,
        min_duration=min,
        max_duration=max,
        limit=limit
    )

@router.get("/{id}", response_model=Trace)
async def trace_detail(id: str):
    trace = await get_trace(id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace

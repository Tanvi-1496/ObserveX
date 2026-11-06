from typing import List, Dict, Any
from fastapi import APIRouter, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_db
from app.models.incident import IncidentModel
from app.services.jaeger import search_traces

router = APIRouter(prefix="/api/search", tags=["search"])

@router.get("")
async def search(q: str = Query(default=""), db: AsyncSession = Depends(get_db)):
    results: List[Dict[str, Any]] = []
    q_lower = q.lower().strip()
    if not q_lower:
        return results

    # 1. Page navigation results
    pages = [
        {"title": "Overview", "path": "/", "kind": "page"},
        {"title": "Metrics Explorer", "path": "/metrics", "kind": "page"},
        {"title": "Logs Explorer", "path": "/logs", "kind": "page"},
        {"title": "Traces", "path": "/traces", "kind": "page"},
        {"title": "Alerts", "path": "/alerts", "kind": "page"},
        {"title": "Incidents", "path": "/incidents", "kind": "page"},
        {"title": "Load Test Lab", "path": "/loadtest", "kind": "page"},
        {"title": "Stack Health", "path": "/health", "kind": "page"},
        {"title": "Settings", "path": "/settings", "kind": "page"},
    ]
    for p in pages:
        if q_lower in p["title"].lower() or q_lower in p["path"]:
            results.append(p)

    # 2. Endpoints
    endpoints = ["/", "/orders", "/slow", "/error"]
    for ep in endpoints:
        if q_lower in ep:
            results.append({"title": f"Logs for {ep}", "path": f"/logs?endpoint={ep}", "kind": "endpoint"})

    # 3. Incidents
    try:
        res = await db.execute(select(IncidentModel))
        incidents = res.scalars().all()
        for inc in incidents:
            if q_lower in inc.id.lower() or q_lower in inc.title.lower() or q_lower in inc.endpoint.lower():
                results.append({"title": f"{inc.id}: {inc.title}", "path": f"/incidents/{inc.id}", "kind": "incident"})
    except Exception:
        pass

    # 4. Traces if query looks like a trace ID
    if len(q_lower) >= 4:
        try:
            traces = await search_traces(range_key="1h", limit=10)
            for t in traces:
                if q_lower in t.id.lower():
                    results.append({"title": f"Trace {t.id} ({t.operation})", "path": f"/traces/{t.id}", "kind": "trace"})
        except Exception:
            pass

    return results

import json
from datetime import datetime, timezone
from typing import List
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Depends, HTTPException, Response
# pyrefly: ignore[missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore[missing-import]
from sqlalchemy import select

from app.db import get_db
from app.models.incident import IncidentModel
from app.schemas.incidents import (
    Incident,
    IncidentPatch,
    CommentCreate,
    ResolveRequest,
    CorrelationResponse,
    TimelineEvent,
    IncidentComment
)
from app.services.correlation import correlate_incident, generate_postmortem_markdown

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

def _model_to_schema(inc: IncidentModel) -> Incident:
    try:
        timeline_raw = json.loads(inc.timeline_json or "[]")
        timeline = [TimelineEvent(**t) for t in timeline_raw]
    except Exception:
        timeline = []

    try:
        comments_raw = json.loads(inc.comments_json or "[]")
        comments = [IncidentComment(**c) for c in comments_raw]
    except Exception:
        comments = []

    return Incident(
        id=inc.id,
        title=inc.title,
        severity=inc.severity,
        status=inc.status,
        endpoint=inc.endpoint,
        startedAt=inc.started_at,
        resolvedAt=inc.resolved_at,
        assignee=inc.assignee,
        timeline=timeline,
        comments=comments
    )

@router.get("", response_model=List[Incident])
async def list_incidents(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).order_by(IncidentModel.started_at.desc()))
    incidents = res.scalars().all()
    return [_model_to_schema(i) for i in incidents]

@router.get("/{id}", response_model=Incident)
async def get_incident(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).where(IncidentModel.id == id))
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return _model_to_schema(inc)

@router.patch("/{id}", response_model=Incident)
async def patch_incident(id: str, patch: IncidentPatch, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).where(IncidentModel.id == id))
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    if patch.status is not None:
        inc.status = patch.status
        if patch.status == "Resolved" and not inc.resolved_at:
            inc.resolved_at = datetime.now(timezone.utc).isoformat()
    if patch.assignee is not None:
        inc.assignee = patch.assignee
    if patch.severity is not None:
        inc.severity = patch.severity

    await db.commit()
    await db.refresh(inc)
    return _model_to_schema(inc)

@router.post("/{id}/comments", response_model=Incident)
async def add_comment(id: str, body: CommentCreate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).where(IncidentModel.id == id))
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    try:
        comments = json.loads(inc.comments_json or "[]")
    except Exception:
        comments = []

    comments.append({
        "author": body.author or "Jordan Lee",
        "text": body.text,
        "time": datetime.now(timezone.utc).isoformat()
    })
    inc.comments_json = json.dumps(comments)

    await db.commit()
    await db.refresh(inc)
    return _model_to_schema(inc)

@router.post("/{id}/resolve", response_model=Incident)
async def resolve_incident(id: str, body: ResolveRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).where(IncidentModel.id == id))
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc.status = "Resolved"
    inc.resolved_at = datetime.now(timezone.utc).isoformat()
    inc.resolution_summary = body.summary or "Resolved via ObserveX Console"

    # Append resolution to timeline
    try:
        timeline = json.loads(inc.timeline_json or "[]")
    except Exception:
        timeline = []

    timeline.append({
        "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "title": "Incident resolved",
        "description": inc.resolution_summary,
        "kind": "action"
    })
    inc.timeline_json = json.dumps(timeline)

    await db.commit()
    await db.refresh(inc)
    return _model_to_schema(inc)

@router.get("/{id}/correlation", response_model=CorrelationResponse)
async def get_correlation(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).where(IncidentModel.id == id))
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    correlation = await correlate_incident(inc)

    # Auto-append timeline events if missing
    try:
        timeline = json.loads(inc.timeline_json or "[]")
        kinds = {t.get("kind") for t in timeline}
        updated = False
        if "log" not in kinds and correlation.rootCause.sampleLogs:
            first_log = correlation.rootCause.sampleLogs[0]
            log_time = datetime.fromisoformat(first_log.timestamp.replace("Z", "+00:00")).strftime("%H:%M:%S")
            timeline.append({
                "time": log_time,
                "title": "First error captured",
                "description": first_log.message,
                "kind": "log"
            })
            updated = True
        if "trace" not in kinds and correlation.rootCause.relatedTraceIds:
            trace_time = datetime.now(timezone.utc).strftime("%H:%M:%S")
            timeline.append({
                "time": trace_time,
                "title": "Slow traces detected",
                "description": "p95 duration crossed 1.5 seconds",
                "kind": "trace"
            })
            updated = True
        if updated:
            inc.timeline_json = json.dumps(timeline)
            await db.commit()
    except Exception as e:
        print(f"Error auto-enriching timeline: {e}")

    return correlation

@router.get("/{id}/postmortem")
async def get_postmortem(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IncidentModel).where(IncidentModel.id == id))
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    md = generate_postmortem_markdown(inc)
    return Response(content=md, media_type="text/markdown")

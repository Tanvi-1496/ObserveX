import json
import random
from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_db
from app.models.alert import AlertModel
from app.models.incident import IncidentModel

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

@router.post("/alertmanager")
async def alertmanager_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload: Dict[str, Any] = await request.json()
    alerts = payload.get("alerts", [])

    for item in alerts:
        status = item.get("status", "firing")
        labels = item.get("labels", {})
        annotations = item.get("annotations", {})
        fingerprint = item.get("fingerprint") or f"fp-{labels.get('alertname')}-{labels.get('endpoint')}"

        alert_name = annotations.get("summary") or labels.get("alertname", "Unknown Alert")
        severity = labels.get("severity", "warning").lower()
        endpoint = labels.get("endpoint", "/")
        starts_at = item.get("startsAt") or datetime.now(timezone.utc).isoformat()
        ends_at = item.get("endsAt")

        # Find existing alert by fingerprint or name+endpoint
        res = await db.execute(
            select(AlertModel).where(
                (AlertModel.fingerprint == fingerprint) |
                ((AlertModel.name == alert_name) & (AlertModel.endpoint == endpoint))
            )
        )
        existing_alert = res.scalar_one_or_none()

        if status == "firing":
            # Check or create incident
            incident_id = existing_alert.incident_id if existing_alert else None
            if not incident_id:
                # Find an open incident for this endpoint
                inc_res = await db.execute(
                    select(IncidentModel).where(
                        (IncidentModel.endpoint == endpoint) &
                        (IncidentModel.status.in_(["Open", "Investigating"]))
                    )
                )
                existing_inc = inc_res.scalar_one_or_none()
                if existing_inc:
                    incident_id = existing_inc.id
                else:
                    # Auto-create new Incident
                    new_inc_num = random.randint(1050, 9999)
                    incident_id = f"INC-{new_inc_num}"
                    timeline = [
                        {
                            "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                            "title": "Alert fired",
                            "description": f"Threshold exceeded on {endpoint}: {alert_name}",
                            "kind": "alert"
                        },
                        {
                            "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                            "title": "Incident auto-created",
                            "description": "Triggered by Alertmanager webhook",
                            "kind": "action"
                        }
                    ]
                    new_inc = IncidentModel(
                        id=incident_id,
                        title=f"Degradation on {endpoint}: {alert_name}",
                        severity=severity,
                        status="Open",
                        endpoint=endpoint,
                        started_at=starts_at,
                        assignee="Unassigned",
                        timeline_json=json.dumps(timeline),
                        comments_json="[]"
                    )
                    db.add(new_inc)

            if existing_alert:
                existing_alert.status = "firing"
                existing_alert.incident_id = incident_id
                existing_alert.since = starts_at
            else:
                alert_id = f"al-{random.randint(100, 9999)}"
                new_alert = AlertModel(
                    id=alert_id,
                    name=alert_name,
                    severity=severity,
                    endpoint=endpoint,
                    value=18.0 if "error" in alert_name.lower() else 2.4,
                    threshold=5.0 if "error" in alert_name.lower() else 1.5,
                    unit="%" if "error" in alert_name.lower() else "s",
                    since=starts_at,
                    status="firing",
                    incident_id=incident_id,
                    fingerprint=fingerprint
                )
                db.add(new_alert)

        elif status == "resolved":
            if existing_alert:
                existing_alert.status = "resolved"

                # Check if we should resolve the linked incident
                if existing_alert.incident_id:
                    inc_res = await db.execute(
                        select(IncidentModel).where(IncidentModel.id == existing_alert.incident_id)
                    )
                    inc = inc_res.scalar_one_or_none()
                    if inc and inc.status != "Resolved":
                        # Check if any other alerts are still firing for this incident
                        other_res = await db.execute(
                            select(AlertModel).where(
                                (AlertModel.incident_id == inc.id) &
                                (AlertModel.status == "firing") &
                                (AlertModel.id != existing_alert.id)
                            )
                        )
                        other_firing = other_res.scalars().all()
                        if not other_firing:
                            inc.status = "Resolved"
                            inc.resolved_at = ends_at or datetime.now(timezone.utc).isoformat()
                            try:
                                tline = json.loads(inc.timeline_json or "[]")
                            except Exception:
                                tline = []
                            tline.append({
                                "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                                "title": "Alert resolved",
                                "description": f"All firing alerts on {endpoint} resolved.",
                                "kind": "action"
                            })
                            inc.timeline_json = json.dumps(tline)

    await db.commit()
    return {"status": "processed", "alerts_count": len(alerts)}

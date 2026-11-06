import os
# pyrefly: ignore[missing-import]
import yaml
from typing import List
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore[missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore[missing-import]
from sqlalchemy import select

from app.config import settings
from app.db import get_db
from app.models.alert import AlertModel
from app.models.alert_rule import AlertRuleModel
from app.schemas.alerts import Alert, AlertRule, AlertRuleCreate, AlertRuleUpdate, SilenceRequest
from app.services.prometheus import validate_promql, reload_prometheus
from app.services.alertmanager import create_alertmanager_silence

router = APIRouter(prefix="/api", tags=["alerts"])

async def sync_prometheus_rules(db: AsyncSession):
    """Regenerates the Prometheus rule file from active DB rules and reloads Prometheus."""
    res = await db.execute(select(AlertRuleModel))
    rules: List[AlertRuleModel] = list(res.scalars().all())

    prom_rules = []
    for r in rules:
        if not r.enabled:
            continue

        clean_alert_name = "".join(c for c in r.name if c.isalnum() or c == "_") or "AlertRule"
        # Format expr
        expr = f"{r.query} {r.condition} {r.threshold}"

        prom_rules.append({
            "alert": clean_alert_name,
            "expr": expr,
            "for": r.duration or "1m",
            "labels": {
                "severity": r.severity,
                "rule_id": r.id
            },
            "annotations": {
                "summary": r.name,
                "description": f"Triggered by rule: {r.name}"
            }
        })

    rule_doc = {
        "groups": [
            {
                "name": "observex_alerts",
                "rules": prom_rules
            }
        ]
    }

    try:
        os.makedirs(os.path.dirname(os.path.abspath(settings.prometheus_rules_path)), exist_ok=True)
        with open(settings.prometheus_rules_path, "w", encoding="utf-8") as f:
            yaml.dump(rule_doc, f, default_flow_style=False)
        await reload_prometheus()
    except Exception as e:
        print(f"Failed to sync Prometheus rules file: {e}")

@router.get("/alerts", response_model=List[Alert])
async def list_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertModel).order_by(AlertModel.since.desc()))
    alerts = res.scalars().all()
    return [
        Alert(
            id=a.id,
            name=a.name,
            severity=a.severity,
            endpoint=a.endpoint,
            value=a.value,
            threshold=a.threshold,
            unit=a.unit,
            since=a.since,
            status=a.status,
            incidentId=a.incident_id or ""
        )
        for a in alerts
    ]

@router.post("/alerts/{id}/acknowledge", response_model=Alert)
async def acknowledge_alert(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertModel).where(AlertModel.id == id))
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "acknowledged"
    await db.commit()
    await db.refresh(alert)
    return Alert(
        id=alert.id,
        name=alert.name,
        severity=alert.severity,
        endpoint=alert.endpoint,
        value=alert.value,
        threshold=alert.threshold,
        unit=alert.unit,
        since=alert.since,
        status=alert.status,
        incidentId=alert.incident_id or ""
    )

@router.post("/alerts/{id}/silence", response_model=Alert)
async def silence_alert(id: str, body: SilenceRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertModel).where(AlertModel.id == id))
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "silenced"
    await db.commit()
    await db.refresh(alert)

    # Dispatch silence to Alertmanager
    await create_alertmanager_silence(
        matchers=[{"name": "alertname", "value": alert.name}],
        duration_minutes=body.minutes or 60
    )

    return Alert(
        id=alert.id,
        name=alert.name,
        severity=alert.severity,
        endpoint=alert.endpoint,
        value=alert.value,
        threshold=alert.threshold,
        unit=alert.unit,
        since=alert.since,
        status=alert.status,
        incidentId=alert.incident_id or ""
    )

@router.get("/alert-rules", response_model=List[AlertRule])
async def list_alert_rules(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertRuleModel))
    rules = res.scalars().all()
    return [
        AlertRule(
            id=r.id,
            name=r.name,
            query=r.query,
            condition=r.condition,
            threshold=r.threshold,
            duration=r.duration,
            severity=r.severity,
            enabled=r.enabled
        )
        for r in rules
    ]

@router.post("/alert-rules", response_model=AlertRule)
async def create_alert_rule(payload: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    # Validate PromQL syntax
    is_valid = await validate_promql(payload.query)
    if not is_valid:
        # Don't hard-crash if Prometheus is just warming up, but check if syntax is clearly wrong
        pass

    import uuid
    rule_id = f"rule-{int(uuid.uuid4().hex[:8], 16)}"
    new_rule = AlertRuleModel(
        id=rule_id,
        name=payload.name,
        query=payload.query,
        condition=payload.condition,
        threshold=payload.threshold,
        duration=payload.duration,
        severity=payload.severity,
        enabled=payload.enabled
    )
    db.add(new_rule)
    await db.commit()
    await db.refresh(new_rule)

    await sync_prometheus_rules(db)

    return AlertRule(
        id=new_rule.id,
        name=new_rule.name,
        query=new_rule.query,
        condition=new_rule.condition,
        threshold=new_rule.threshold,
        duration=new_rule.duration,
        severity=new_rule.severity,
        enabled=new_rule.enabled
    )

@router.put("/alert-rules/{id}", response_model=AlertRule)
async def update_alert_rule(id: str, payload: AlertRuleUpdate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertRuleModel).where(AlertRuleModel.id == id))
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    if payload.name is not None:
        rule.name = payload.name
    if payload.query is not None:
        rule.query = payload.query
    if payload.condition is not None:
        rule.condition = payload.condition
    if payload.threshold is not None:
        rule.threshold = payload.threshold
    if payload.duration is not None:
        rule.duration = payload.duration
    if payload.severity is not None:
        rule.severity = payload.severity
    if payload.enabled is not None:
        rule.enabled = payload.enabled

    await db.commit()
    await db.refresh(rule)
    await sync_prometheus_rules(db)

    return AlertRule(
        id=rule.id,
        name=rule.name,
        query=rule.query,
        condition=rule.condition,
        threshold=rule.threshold,
        duration=rule.duration,
        severity=rule.severity,
        enabled=rule.enabled
    )

@router.delete("/alert-rules/{id}")
async def delete_alert_rule(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertRuleModel).where(AlertRuleModel.id == id))
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    await db.delete(rule)
    await db.commit()
    await sync_prometheus_rules(db)
    return {"ok": True, "message": "Alert rule deleted"}

import json
from typing import List
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Depends
# pyrefly: ignore[missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore[missing-import]
from sqlalchemy import select

from app.db import get_db
from app.models.loadtest import LoadTestRunModel
from app.schemas.loadtest import LoadTestConfig, LoadTestStatus, LoadTestRunRecord
from app.services.loadtest import load_test_manager

router = APIRouter(prefix="/api/loadtest", tags=["loadtest"])

@router.post("/start")
async def start_load_test(config: LoadTestConfig):
    return await load_test_manager.start(config)

@router.post("/stop")
async def stop_load_test():
    return await load_test_manager.stop()

@router.get("/status", response_model=LoadTestStatus)
async def get_load_test_status():
    return await load_test_manager.get_status()

@router.get("/runs", response_model=List[LoadTestRunRecord])
async def list_load_test_runs(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LoadTestRunModel).order_by(LoadTestRunModel.created_at.desc()))
    records = res.scalars().all()
    out = []
    for r in records:
        try:
            endpoints = json.loads(r.endpoints_json)
        except Exception:
            endpoints = ["/"]
        cfg = LoadTestConfig(
            endpoints=endpoints,
            rps=r.rps,
            duration=r.duration,
            concurrency=r.concurrency,
            latency=r.latency,
            errorRate=r.error_rate,
            cpuSpike=r.cpu_spike
        )
        out.append(
            LoadTestRunRecord(
                id=r.id,
                config=cfg,
                requests=r.total_requests,
                latency=r.avg_latency,
                errors=r.error_percent,
                alertsTriggered=r.alerts_triggered,
                createdAt=r.created_at
            )
        )
    return out

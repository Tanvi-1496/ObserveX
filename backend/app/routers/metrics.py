from typing import List, Optional
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Query, Depends
# pyrefly: ignore[missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore[missing-import]
from sqlalchemy import select, func

from app.db import get_db
from app.models.alert import AlertModel
from app.schemas.metrics import MetricPoint, KpiResponse, MetricNameInfo
from app.services.prometheus import get_timeseries, get_kpis, get_metric_names

router = APIRouter(prefix="/api", tags=["metrics"])

@router.get("/timeseries", response_model=List[MetricPoint])
async def timeseries_endpoint(
    query: Optional[str] = Query(default="overview"),
    range: str = Query(default="15m")
):
    return await get_timeseries(query_or_template=query or "overview", range_key=range)

@router.get("/kpis", response_model=KpiResponse)
async def kpis_endpoint(
    range: str = Query(default="15m"),
    db: AsyncSession = Depends(get_db)
):
    # Count active firing alerts from DB
    res = await db.execute(
        select(func.count()).select_from(AlertModel).where(AlertModel.status == "firing")
    )
    active_count = res.scalar() or 0
    return await get_kpis(range_key=range, active_alerts_count=active_count)

@router.get("/metrics/names", response_model=List[MetricNameInfo])
async def metric_names_endpoint():
    return await get_metric_names()

from typing import List
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Query

from app.schemas.insights import Insight
from app.services.anomaly import detect_anomalies

router = APIRouter(prefix="/api/insights", tags=["insights"])

@router.get("", response_model=List[Insight])
async def get_insights(range: str = Query(default="15m")):
    return await detect_anomalies(range_key=range)

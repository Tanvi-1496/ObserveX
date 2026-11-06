import time
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter
import httpx

router = APIRouter(prefix="/api", tags=["settings"])

class ConnectionTestRequest(BaseModel):
    type: Optional[str] = None
    url: str

class ConnectionTestResponse(BaseModel):
    ok: bool
    latency: int
    message: Optional[str] = None

datasources_config = {
    "Prometheus": "http://prometheus:9090",
    "Loki": "http://loki:3100",
    "Jaeger": "http://jaeger:16686"
}

@router.post("/connections/test", response_model=ConnectionTestResponse)
async def test_connection(req: ConnectionTestRequest):
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(req.url)
            dur_ms = max(1, int((time.time() - t0) * 1000))
            return ConnectionTestResponse(ok=True, latency=dur_ms, message=f"Connected with HTTP {resp.status_code}")
    except Exception as e:
        dur_ms = max(1, int((time.time() - t0) * 1000))
        return ConnectionTestResponse(ok=False, latency=dur_ms, message=str(e))

@router.get("/settings/datasources")
async def get_datasources():
    return datasources_config

@router.put("/settings/datasources")
async def update_datasources(data: Dict[str, str]):
    datasources_config.update(data)
    return {"ok": True, "datasources": datasources_config}

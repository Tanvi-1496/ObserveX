# pyrefly: ignore[missing-import]
import pytest
import json
# pyrefly: ignore[missing-import]
import respx
# pyrefly: ignore[missing-import]
from httpx import Response
from app.services.loki import search_logs, get_logs_volume
from app.config import settings

@pytest.mark.asyncio
async def test_search_logs_normalization():
    with respx.mock(base_url=settings.loki_url) as respx_mock:
        raw_log_line = json.dumps({
            "timestamp": "2026-11-01T14:28:31.000Z",
            "level": "ERROR",
            "endpoint": "/error",
            "message": "Simulated database timeout",
            "trace_id": "a1b2c3d4e5f67890",
            "status": 500,
            "duration_ms": 185.4
        })
        sample_response = {
            "status": "success",
            "data": {
                "resultType": "streams",
                "result": [
                    {
                        "stream": {"job": "demo-app", "level": "ERROR", "endpoint": "/error"},
                        "values": [
                            ["1730467200000000000", raw_log_line]
                        ]
                    }
                ]
            }
        }
        respx_mock.get("/loki/api/v1/query_range").mock(return_value=Response(200, json=sample_response))

        logs = await search_logs(range_key="15m", level="ERROR", limit=10)
        assert len(logs) == 1
        entry = logs[0]
        assert entry.id == "log-1730467200000000000"
        assert entry.level == "ERROR"
        assert entry.endpoint == "/error"
        assert entry.message == "Simulated database timeout"
        assert entry.traceId == "a1b2c3d4e5f67890"
        assert entry.status == 500
        assert entry.duration == 185.4

@pytest.mark.asyncio
async def test_get_logs_volume():
    with respx.mock(base_url=settings.loki_url) as respx_mock:
        raw_log_line = json.dumps({
            "timestamp": "2026-11-01T14:28:31.000Z",
            "level": "ERROR",
            "endpoint": "/error",
            "message": "Timeout",
            "trace_id": "abc",
            "status": 500,
            "duration_ms": 100.0
        })
        respx_mock.get("/loki/api/v1/query_range").mock(return_value=Response(200, json={
            "status": "success",
            "data": {
                "resultType": "streams",
                "result": [{"stream": {}, "values": [["1730467200000000000", raw_log_line]]}]
            }
        }))

        buckets = await get_logs_volume(range_key="15m")
        assert len(buckets) > 0
        b = buckets[0]
        assert hasattr(b, "time")
        assert hasattr(b, "info")
        assert hasattr(b, "warn")
        assert hasattr(b, "error")

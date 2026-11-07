# pyrefly: ignore[missing-import]
import pytest
# pyrefly: ignore[missing-import]
import respx
# pyrefly: ignore[missing-import]
from httpx import Response
from app.services.prometheus import get_timeseries, get_kpis, get_metric_names, clear_cache
from app.config import settings

@pytest.mark.asyncio
async def test_get_timeseries_normalization():
    clear_cache()
    with respx.mock(base_url=settings.prometheus_url) as respx_mock:
        sample_response = {
            "status": "success",
            "data": {
                "resultType": "matrix",
                "result": [
                    {
                        "metric": {},
                        "values": [
                            [1730467200, "125.4"],
                            [1730467215, "130.8"],
                            [1730467230, "142.0"]
                        ]
                    }
                ]
            }
        }
        respx_mock.get("/api/v1/query_range").mock(return_value=Response(200, json=sample_response))

        points = await get_timeseries("overview", "15m", skip_cache=True)
        assert len(points) > 0
        p = points[0]
        assert hasattr(p, "time")
        assert hasattr(p, "timestamp")
        assert hasattr(p, "requests")
        assert hasattr(p, "errors")
        assert hasattr(p, "latency")
        assert hasattr(p, "p50")
        assert hasattr(p, "p95")
        assert hasattr(p, "p99")
        assert hasattr(p, "cpu")
        assert hasattr(p, "memory")

@pytest.mark.asyncio
async def test_get_kpis():
    clear_cache()
    with respx.mock(base_url=settings.prometheus_url) as respx_mock:
        respx_mock.get("/api/v1/query_range").mock(return_value=Response(200, json={
            "status": "success",
            "data": {
                "resultType": "matrix",
                "result": [{"metric": {}, "values": [[1730467200, "150.0"]]}]
            }
        }))
        respx_mock.get("/api/v1/query").mock(return_value=Response(200, json={
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [{"value": [1730467200, "99.98"]}]
            }
        }))

        kpis = await get_kpis("15m", active_alerts_count=2)
        assert kpis.requests >= 0
        assert kpis.uptime == 99.98
        assert kpis.activeAlerts == 2
        assert len(kpis.series) > 0

@pytest.mark.asyncio
async def test_get_metric_names():
    clear_cache()
    with respx.mock(base_url=settings.prometheus_url) as respx_mock:
        respx_mock.get("/api/v1/metadata").mock(return_value=Response(200, json={
            "status": "success",
            "data": {
                "http_requests_total": [{"type": "counter"}],
                "http_request_duration_seconds": [{"type": "histogram"}],
                "process_resident_memory_bytes": [{"type": "gauge"}]
            }
        }))

        names = await get_metric_names()
        assert len(names) >= 3
        types = {n.name: n.type for n in names}
        assert types["http_requests_total"] == "counter"
        assert types["http_request_duration_seconds"] == "histogram"

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
# pyrefly: ignore[missing-import]
import httpx
from app.config import settings
from app.schemas.traces import Trace, Span
from app.services.time_utils import parse_time_range

def _parse_jaeger_trace(raw_trace: Dict[str, Any]) -> Optional[Trace]:
    trace_id = raw_trace.get("traceID")
    raw_spans = raw_trace.get("spans", [])
    processes = raw_trace.get("processes", {})

    if not trace_id or not raw_spans:
        return None

    # Find trace start in microseconds
    min_start_us = min(s.get("startTime", 0) for s in raw_spans)
    max_end_us = max(s.get("startTime", 0) + s.get("duration", 0) for s in raw_spans)
    total_duration_ms = max(1.0, round((max_end_us - min_start_us) / 1000.0, 1))

    start_iso = datetime.fromtimestamp(min_start_us / 1e6, tz=timezone.utc).isoformat()

    has_error = False
    spans: List[Span] = []
    root_op = "GET /"
    endpoint = "/"

    for s in raw_spans:
        span_id = s.get("spanID", "")
        op = s.get("operationName", "request")
        dur_ms = max(0.1, round(s.get("duration", 0) / 1000.0, 1))
        offset_ms = max(0.0, round((s.get("startTime", min_start_us) - min_start_us) / 1000.0, 1))

        # Parent ID
        parent_id = None
        for ref in s.get("references", []):
            if ref.get("refType") == "CHILD_OF":
                parent_id = ref.get("spanID")
                break

        # Process service name
        proc_id = s.get("processID")
        svc = processes.get(proc_id, {}).get("serviceName", "demo-flask-app")

        # Tags
        tags_dict = {}
        span_is_error = False
        for tag in s.get("tags", []):
            k = tag.get("key")
            v = tag.get("value")
            tags_dict[k] = v
            if k == "error" and (v is True or str(v).lower() in ["true", "1"]):
                span_is_error = True
            if k in ["http.status_code", "http.status"] and isinstance(v, (int, float)) and v >= 500:
                span_is_error = True
            if k in ["http.route", "http.target"]:
                endpoint = str(v)

        # In case operation name is e.g. "GET /orders"
        if parent_id is None:
            root_op = op
            if " " in op:
                parts = op.split(" ")
                if len(parts) > 1 and parts[1].startswith("/"):
                    endpoint = parts[1]

        # Explicit service tagging for child spans (e.g., db.query orders -> postgres)
        if "db" in op.lower() or tags_dict.get("component") == "psycopg":
            svc = "postgres"
        elif "cache" in op.lower() or tags_dict.get("component") == "redis":
            svc = "redis"

        if span_is_error:
            has_error = True

        spans.append(
            Span(
                id=span_id,
                parentId=parent_id,
                operation=op,
                service=svc,
                start=offset_ms,
                duration=dur_ms,
                status="error" if span_is_error else "ok",
                tags=tags_dict
            )
        )

    # Sort spans by start time
    spans.sort(key=lambda x: x.start)

    return Trace(
        id=trace_id,
        endpoint=endpoint,
        operation=root_op,
        startTime=start_iso,
        duration=total_duration_ms,
        status="error" if has_error else "ok",
        spans=spans
    )

async def search_traces(
    range_key: str = "15m",
    endpoint: Optional[str] = None,
    status: Optional[str] = "all",
    min_duration: Optional[float] = 0,
    max_duration: Optional[float] = 4000,
    limit: int = 100
) -> List[Trace]:
    start, end, _ = parse_time_range(range_key)
    start_us = int(start * 1e6)
    end_us = int(end * 1e6)

    traces: List[Trace] = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.jaeger_url}/api/traces",
                params={
                    "service": "demo-flask-app",
                    "start": str(start_us),
                    "end": str(end_us),
                    "limit": str(limit * 2)
                },
                timeout=settings.request_timeout_seconds
            )
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                for raw in data:
                    t = _parse_jaeger_trace(raw)
                    if not t:
                        continue
                    if endpoint and endpoint not in t.endpoint and endpoint not in t.operation:
                        continue
                    if status and status != "all" and t.status != status:
                        continue
                    if min_duration is not None and t.duration < min_duration:
                        continue
                    if max_duration is not None and t.duration > max_duration:
                        continue
                    traces.append(t)
    except Exception as e:
        print(f"Jaeger search_traces error: {e}")

    # Sort newest first
    traces.sort(key=lambda t: t.startTime, reverse=True)
    return traces[:limit]

async def get_trace(trace_id: str) -> Optional[Trace]:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.jaeger_url}/api/traces/{trace_id}",
                timeout=settings.request_timeout_seconds
            )
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                if data:
                    return _parse_jaeger_trace(data[0])
    except Exception as e:
        print(f"Jaeger get_trace error for {trace_id}: {e}")
    return None

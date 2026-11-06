import os
import time
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, AsyncGenerator
# pyrefly: ignore[missing-import]
import httpx
from app.config import settings
from app.schemas.logs import LogEntry, LogVolumeBucket
from app.services.time_utils import parse_time_range

async def search_logs(
    range_key: str = "15m",
    level: Optional[str] = None,
    endpoint: Optional[str] = None,
    text: Optional[str] = None,
    trace_id: Optional[str] = None,
    limit: int = 100
) -> List[LogEntry]:
    start, end, _ = parse_time_range(range_key)
    start_ns = int(start * 1e9)
    end_ns = int(end * 1e9)

    # Build safe LogQL query
    query_parts = ['{job="demo-app"}']
    if level:
        query_parts.append(f'| json | level =~ "(?i){level}"')
    else:
        query_parts.append('| json')

    if endpoint:
        query_parts.append(f'| endpoint = "{endpoint}"')

    if trace_id:
        query_parts.append(f'| trace_id = "{trace_id}"')

    if text:
        clean_text = text.replace('"', '\\"')
        query_parts.append(f'|= "{clean_text}"')

    logql = " ".join(query_parts)

    entries: List[LogEntry] = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.loki_url}/loki/api/v1/query_range",
                params={
                    "query": logql,
                    "start": str(start_ns),
                    "end": str(end_ns),
                    "limit": str(limit),
                    "direction": "backward"
                },
                timeout=settings.request_timeout_seconds
            )
            if resp.status_code == 200:
                data = resp.json()
                streams = data.get("data", {}).get("result", [])
                for stream in streams:
                    for ts_ns, line in stream.get("values", []):
                        try:
                            # Try to parse line as JSON
                            parsed = json.loads(line)
                            log_id = f"log-{ts_ns}"
                            ts_iso = parsed.get("timestamp") or datetime.fromtimestamp(int(ts_ns) / 1e9, tz=timezone.utc).isoformat()
                            entries.append(
                                LogEntry(
                                    id=log_id,
                                    timestamp=ts_iso,
                                    level=str(parsed.get("level", "INFO")).upper(),
                                    endpoint=str(parsed.get("endpoint", "/")),
                                    message=str(parsed.get("message", line)),
                                    traceId=str(parsed.get("trace_id", "")),
                                    status=int(parsed.get("status", 200)),
                                    duration=float(parsed.get("duration_ms", 10.0))
                                )
                            )
                        except Exception:
                            # Fallback if raw text
                            entries.append(
                                LogEntry(
                                    id=f"log-{ts_ns}",
                                    timestamp=datetime.fromtimestamp(int(ts_ns) / 1e9, tz=timezone.utc).isoformat(),
                                    level="INFO",
                                    endpoint="/",
                                    message=line,
                                    traceId="",
                                    status=200,
                                    duration=10.0
                                )
                            )
    except Exception as e:
        print(f"Loki search_logs error: {e}")

    # Fallback to local shared log file if Loki is still indexing or unreachable
    if not entries:
        log_file = "/var/log/app/app.log"
        if os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                for i, line in enumerate(reversed(lines)):
                    if len(entries) >= limit:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        p = json.loads(line)
                        p_level = str(p.get("level", "INFO")).upper()
                        p_endpoint = str(p.get("endpoint", "/"))
                        p_trace_id = str(p.get("trace_id", ""))
                        p_msg = str(p.get("message", ""))
                        if level and p_level != level.upper():
                            continue
                        if endpoint and p_endpoint != endpoint:
                            continue
                        if trace_id and p_trace_id != trace_id:
                            continue
                        if text and text.lower() not in p_msg.lower():
                            continue
                        entries.append(
                            LogEntry(
                                id=f"log-f-{i}",
                                timestamp=p.get("timestamp", datetime.now(timezone.utc).isoformat()),
                                level=p_level,
                                endpoint=p_endpoint,
                                message=p_msg,
                                traceId=p_trace_id,
                                status=int(p.get("status", 200)),
                                duration=float(p.get("duration_ms", 10.0))
                            )
                        )
                    except Exception:
                        pass
            except Exception as fe:
                print(f"Error reading fallback log file: {fe}")

    # Sort descending by timestamp
    entries.sort(key=lambda x: x.timestamp, reverse=True)
    return entries[:limit]

async def get_logs_volume(range_key: str = "15m") -> List[LogVolumeBucket]:
    start, end, step = parse_time_range(range_key)
    # Fetch all logs in range
    logs = await search_logs(range_key=range_key, limit=500)
    buckets: List[LogVolumeBucket] = []

    # Create time buckets
    cur = start
    while cur <= end:
        bucket_end = cur + step
        dt = datetime.fromtimestamp(cur, tz=timezone.utc)
        time_label = dt.strftime("%H:%M")
        b_info = 0
        b_warn = 0
        b_error = 0
        for l in logs:
            try:
                l_ts = datetime.fromisoformat(l.timestamp.replace("Z", "+00:00")).timestamp()
                if cur <= l_ts < bucket_end:
                    if l.level == "ERROR":
                        b_error += 1
                    elif l.level == "WARN":
                        b_warn += 1
                    else:
                        b_info += 1
            except Exception:
                pass
        buckets.append(
            LogVolumeBucket(
                time=time_label,
                timestamp=cur * 1000.0,
                info=b_info,
                warn=b_warn,
                error=b_error
            )
        )
        cur += step
    return buckets

async def live_tail_generator(
    level: Optional[str] = None,
    endpoint: Optional[str] = None,
    text: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Generates SSE formatted events for live tail."""
    last_seen_id = None
    while True:
        try:
            recent = await search_logs(range_key="5m", level=level, endpoint=endpoint, text=text, limit=10)
            if recent:
                new_logs = []
                for entry in recent:
                    if last_seen_id and entry.id == last_seen_id:
                        break
                    new_logs.append(entry)
                if new_logs:
                    last_seen_id = recent[0].id
                    for item in reversed(new_logs):
                        yield f"data: {json.dumps(item.model_dump(by_alias=True))}\n\n"
        except Exception as e:
            print(f"SSE tail error: {e}")
        await asyncio.sleep(2.0)

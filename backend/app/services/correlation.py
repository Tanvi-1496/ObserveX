import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from collections import Counter

from app.models.incident import IncidentModel
from app.schemas.incidents import CorrelationResponse, CorrelationSignal, RootCause
from app.services.prometheus import get_timeseries
from app.services.loki import search_logs
from app.services.jaeger import search_traces

async def correlate_incident(incident: IncidentModel) -> CorrelationResponse:
    # Determine window
    try:
        started_dt = datetime.fromisoformat(incident.started_at.replace("Z", "+00:00"))
    except Exception:
        started_dt = datetime.now(timezone.utc) - timedelta(minutes=15)

    window_minutes = max(15, min(1440, int((datetime.now(timezone.utc) - started_dt).total_seconds() / 60)))
    range_key = "15m" if window_minutes <= 15 else "1h" if window_minutes <= 60 else "6h"

    # Fetch metric series
    series = await get_timeseries("correlation", range_key)

    # Fetch error logs for endpoint
    logs = await search_logs(
        range_key=range_key,
        endpoint=incident.endpoint if incident.endpoint != "/" else None,
        level="ERROR",
        limit=50
    )

    # Fetch traces for endpoint
    traces = await search_traces(
        range_key=range_key,
        endpoint=incident.endpoint if incident.endpoint != "/" else None,
        status="error",
        limit=30
    )

    # Correlate signals into shared buckets
    signals: List[CorrelationSignal] = []
    for p in series:
        # Count logs around timestamp
        p_t_sec = p.timestamp / 1000.0
        matching_logs = [l for l in logs if abs(datetime.fromisoformat(l.timestamp.replace("Z", "+00:00")).timestamp() - p_t_sec) < 60]
        matching_traces = [t for t in traces if abs(datetime.fromisoformat(t.startTime.replace("Z", "+00:00")).timestamp() - p_t_sec) < 60]

        signals.append(
            CorrelationSignal(
                time=p.time,
                timestamp=p.timestamp,
                errors=p.errors,
                latency=p.latency,
                logs=len(matching_logs),
                traces=len(matching_traces)
            )
        )

    # Determine Root Cause
    # Most frequent error message from logs
    error_messages = [l.message for l in logs if l.level == "ERROR"]
    frequent_error = Counter(error_messages).most_common(1)[0][0] if error_messages else "Simulated database timeout"

    top_endpoint = incident.endpoint or "/error"
    related_trace_ids = [t.id for t in traces[:5]]
    if not related_trace_ids and logs:
        related_trace_ids = [l.traceId for l in logs[:5] if l.traceId]

    sample_logs = logs[:3]

    # Heuristic confidence calculation
    error_peak = max([p.errors for p in series] + [0.0])
    confidence = min(96, max(75, int(70 + (error_peak * 1.2) + (len(logs) * 0.5))))

    description = (
        f"Requests to {top_endpoint} are failing after a {frequent_error.lower()}. "
        f"The error rate spiked to {error_peak:.1f}%, correlated with slow database and cache spans."
    )

    root_cause = RootCause(
        failingEndpoint=top_endpoint,
        frequentError=frequent_error,
        affectedVersion="demo-flask-app v1.4.2",
        confidence=confidence,
        description=description,
        relatedTraceIds=related_trace_ids,
        sampleLogs=sample_logs
    )

    return CorrelationResponse(
        incidentId=incident.id,
        signals=signals,
        rootCause=root_cause
    )

def generate_postmortem_markdown(incident: IncidentModel) -> str:
    timeline_items = []
    try:
        raw_timeline = json.loads(incident.timeline_json or "[]")
        for item in raw_timeline:
            timeline_items.append(f"- **{item.get('time', '')}**: {item.get('title', '')} - {item.get('description', '')}")
    except Exception:
        pass

    timeline_str = "\n".join(timeline_items) if timeline_items else "- No timeline events recorded."
    summary = incident.resolution_summary or "Incident resolved after mitigation of the downstream timeout."

    return f"""# Incident Post-Mortem: {incident.id} - {incident.title}

## Summary
On {incident.started_at}, an alert triggered for `{incident.endpoint}` due to service degradation.

- **Severity**: {incident.severity.upper()}
- **Status**: {incident.status}
- **Assignee**: {incident.assignee}
- **Affected Service**: demo-flask-app (v1.4.2)
- **Resolved At**: {incident.resolved_at or 'In progress'}

---

## 1. What Happened
Requests to `{incident.endpoint}` experienced elevated latency and 5xx errors, breaching the configured error rate SLO.

## 2. Impact
Service availability dropped during the incident window. Synthetic and client requests to `{incident.endpoint}` encountered timeouts.

## 3. Root Cause
Detailed signal correlation identified connection exhaustion and timeout when querying read replicas (`Simulated database timeout`). Child span waterfall analysis confirmed latency was concentrated in the database query layer.

## 4. Timeline
{timeline_str}

## 5. Resolution & Prevention
{summary}

### Action Items
1. Increase pool timeout and connection limits for PostgreSQL replicas.
2. Implement circuit breakers on failing child spans to prevent cascade failures.
3. Review Alertmanager threshold alerting duration to notify oncall within 15 seconds.
"""

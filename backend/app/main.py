import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# pyrefly: ignore[missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore[missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore[missing-import]
from fastapi.responses import JSONResponse, Response
# pyrefly: ignore[missing-import]
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Counter, Histogram

from app.config import settings
from app.db import engine, Base, AsyncSessionLocal
from app.models.alert_rule import AlertRuleModel
from app.models.alert import AlertModel
from app.models.incident import IncidentModel
from app.routers.alerts import sync_prometheus_rules
from app.services.loadtest import load_test_manager

from app.routers import (
    metrics,
    logs,
    traces,
    alerts,
    incidents,
    webhooks,
    insights,
    loadtest,
    health,
    settings as settings_router,
    search
)

API_REQUESTS = Counter("observex_api_requests_total", "Total requests to ObserveX API", ["endpoint", "status"])
API_LATENCY = Histogram("observex_api_latency_seconds", "ObserveX API request latency in seconds", ["endpoint"])

async def seed_initial_data():
    async with AsyncSessionLocal() as session:
        # 1. Alert Rules
        res = await session.execute(Base.metadata.tables["alert_rules"].select())
        if not res.first():
            initial_rules = [
                AlertRuleModel(
                    id="rule-1",
                    name="High error rate",
                    query='rate(http_requests_total{status=~"5.."}[1m])',
                    condition=">",
                    threshold=5.0,
                    duration="1m",
                    severity="critical",
                    enabled=True
                ),
                AlertRuleModel(
                    id="rule-2",
                    name="High p95 latency",
                    query='histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[1m]))',
                    condition=">",
                    threshold=1.5,
                    duration="1m",
                    severity="warning",
                    enabled=True
                ),
                AlertRuleModel(
                    id="rule-3",
                    name="Container restarting",
                    query='increase(container_restarts_total[5m])',
                    condition=">",
                    threshold=2.0,
                    duration="2m",
                    severity="warning",
                    enabled=True
                ),
            ]
            session.add_all(initial_rules)

        # 2. Incidents
        inc_res = await session.execute(Base.metadata.tables["incidents"].select())
        if not inc_res.first():
            timeline_sample = [
                {"time": "14:28:02", "title": "Alert fired", "description": "Threshold exceeded on /error", "kind": "alert"},
                {"time": "14:28:18", "title": "Error rate spike", "description": "Error rate increased from 2.1% to 18%", "kind": "metric"},
                {"time": "14:28:31", "title": "First error captured", "description": "Simulated database timeout", "kind": "log"},
                {"time": "14:29:04", "title": "Slow traces detected", "description": "p95 duration crossed 1.5 seconds", "kind": "trace"},
                {"time": "14:31:22", "title": "Acknowledged by Maya", "description": "Investigation started", "kind": "action"}
            ]
            initial_incidents = [
                IncidentModel(
                    id="INC-1042",
                    title="Elevated errors on checkout API",
                    severity="critical",
                    status="Open",
                    endpoint="/error",
                    started_at=datetime.now(timezone.utc).isoformat(),
                    assignee="Maya Chen",
                    timeline_json=json.dumps(timeline_sample),
                    comments_json="[]"
                ),
                IncidentModel(
                    id="INC-1041",
                    title="Slow order retrieval",
                    severity="warning",
                    status="Investigating",
                    endpoint="/orders",
                    started_at=datetime.now(timezone.utc).isoformat(),
                    assignee="Alex Kim",
                    timeline_json=json.dumps(timeline_sample),
                    comments_json="[]"
                ),
                IncidentModel(
                    id="INC-1039",
                    title="Intermittent service latency",
                    severity="warning",
                    status="Resolved",
                    endpoint="/slow",
                    started_at=datetime.now(timezone.utc).isoformat(),
                    resolved_at=datetime.now(timezone.utc).isoformat(),
                    assignee="Priya Shah",
                    timeline_json=json.dumps(timeline_sample),
                    comments_json="[]"
                )
            ]
            session.add_all(initial_incidents)

        # 3. Alerts
        al_res = await session.execute(Base.metadata.tables["alerts"].select())
        if not al_res.first():
            initial_alerts = [
                AlertModel(
                    id="al-1",
                    name="High error rate on /error",
                    severity="critical",
                    endpoint="/error",
                    value=18.0,
                    threshold=5.0,
                    unit="%",
                    since=datetime.now(timezone.utc).isoformat(),
                    status="firing",
                    incident_id="INC-1042",
                    fingerprint="fp-err-1"
                ),
                AlertModel(
                    id="al-2",
                    name="p95 latency elevated",
                    severity="warning",
                    endpoint="/slow",
                    value=2.4,
                    threshold=1.5,
                    unit="s",
                    since=datetime.now(timezone.utc).isoformat(),
                    status="firing",
                    incident_id="INC-1041",
                    fingerprint="fp-lat-2"
                )
            ]
            session.add_all(initial_alerts)

        await session.commit()
        await sync_prometheus_rules(session)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_initial_data()
    yield
    # Shutdown
    await load_test_manager.stop()

app = FastAPI(
    title="ObserveX API",
    description="Unified Observability Console Backend",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def prometheus_metrics_middleware(request: Request, call_next):
    endpoint = request.url.path
    try:
        response = await call_next(request)
        API_REQUESTS.labels(endpoint=endpoint, status=str(response.status_code)).inc()
        return response
    except Exception as exc:
        API_REQUESTS.labels(endpoint=endpoint, status="500").inc()
        raise exc

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "message": str(exc)}
    )

# Include Routers
app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(logs.router)
app.include_router(traces.router)
app.include_router(alerts.router)
app.include_router(incidents.router)
app.include_router(webhooks.router)
app.include_router(insights.router)
app.include_router(loadtest.router)
app.include_router(settings_router.router)
app.include_router(search.router)

@app.get("/metrics")
def get_metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

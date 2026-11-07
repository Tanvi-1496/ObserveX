import json
import pytest
from httpx import AsyncClient
from app.models.incident import IncidentModel
from app.models.alert import AlertModel
from app.models.alert_rule import AlertRuleModel
from tests.conftest import TestSessionLocal

@pytest.mark.asyncio
async def test_health_endpoints(client: AsyncClient):
    r1 = await client.get("/healthz")
    assert r1.status_code == 200
    assert r1.json()["status"] == "ok"

    r2 = await client.get("/readyz")
    assert r2.status_code == 200
    assert r2.json()["status"] == "ready"

@pytest.mark.asyncio
async def test_incidents_crud_and_correlation(client: AsyncClient):
    # Seed an incident
    async with TestSessionLocal() as session:
        inc = IncidentModel(
            id="INC-TEST-1",
            title="Database Latency Spike",
            severity="critical",
            status="Open",
            endpoint="/error",
            started_at="2026-11-06T12:00:00Z",
            assignee="Maya Chen",
            timeline_json=json.dumps([
                {"time": "12:00:00", "title": "Alert fired", "description": "Error rate spiked to 18%", "kind": "alert"}
            ]),
            comments_json="[]"
        )
        session.add(inc)
        al = AlertModel(
            id="al-test-1",
            name="High error rate on /error",
            severity="critical",
            endpoint="/error",
            value=18.0,
            threshold=5.0,
            unit="%",
            since="2026-11-06T12:00:00Z",
            status="firing",
            incident_id="INC-TEST-1",
            fingerprint="fp-test-1"
        )
        session.add(al)
        await session.commit()

    # 1. List incidents
    r_list = await client.get("/api/incidents")
    assert r_list.status_code == 200
    items = r_list.json()
    assert any(i["id"] == "INC-TEST-1" for i in items)

    # 2. Get incident by id
    r_get = await client.get("/api/incidents/INC-TEST-1")
    assert r_get.status_code == 200
    assert r_get.json()["id"] == "INC-TEST-1"
    assert r_get.json()["assignee"] == "Maya Chen"

    # 3. Patch incident (status & assignee)
    r_patch = await client.patch("/api/incidents/INC-TEST-1", json={"status": "Investigating", "assignee": "Alex Kim"})
    assert r_patch.status_code == 200
    assert r_patch.json()["status"] == "Investigating"
    assert r_patch.json()["assignee"] == "Alex Kim"

    # 4. Add comment
    r_comm = await client.post("/api/incidents/INC-TEST-1/comments", json={"author": "Alex Kim", "text": "Looking into slow traces"})
    assert r_comm.status_code == 200
    assert len(r_comm.json()["comments"]) == 1
    assert r_comm.json()["comments"][0]["text"] == "Looking into slow traces"

    # 5. Correlation & root cause consistency check
    r_corr = await client.get("/api/incidents/INC-TEST-1/correlation")
    assert r_corr.status_code == 200
    corr_data = r_corr.json()
    assert corr_data["incidentId"] == "INC-TEST-1"
    # Root cause must not say 0.0%
    assert "0.0%" not in corr_data["rootCause"]["description"]
    assert "18.0%" in corr_data["rootCause"]["description"]
    assert corr_data["rootCause"]["confidence"] >= 75

    # 6. Resolve incident
    r_res = await client.post("/api/incidents/INC-TEST-1/resolve", json={"summary": "Connection pool size increased"})
    assert r_res.status_code == 200
    assert r_res.json()["status"] == "Resolved"

    # 7. Post-mortem markdown
    r_pm = await client.get("/api/incidents/INC-TEST-1/postmortem")
    assert r_pm.status_code == 200
    assert "Incident Post-Mortem" in r_pm.text

@pytest.mark.asyncio
async def test_alerts_and_rules(client: AsyncClient):
    # 1. Create alert rule
    r_rule = await client.post("/api/alert-rules", json={
        "name": "High 5xx Rate",
        "query": 'rate(http_requests_total{status=~"5.."}[1m])',
        "condition": ">",
        "threshold": 10.0,
        "duration": "1m",
        "severity": "critical",
        "enabled": True
    })
    assert r_rule.status_code == 200
    rule_id = r_rule.json()["id"]

    # 2. List rules
    r_list = await client.get("/api/alert-rules")
    assert r_list.status_code == 200
    assert any(r["id"] == rule_id for r in r_list.json())

    # 3. Update rule
    r_up = await client.put(f"/api/alert-rules/{rule_id}", json={"threshold": 15.0, "enabled": False})
    assert r_up.status_code == 200
    assert r_up.json()["threshold"] == 15.0
    assert r_up.json()["enabled"] is False

    # 4. Delete rule
    r_del = await client.delete(f"/api/alert-rules/{rule_id}")
    assert r_del.status_code == 200

@pytest.mark.asyncio
async def test_settings_endpoints(client: AsyncClient):
    # 1. General settings
    r_gen = await client.get("/api/settings")
    assert r_gen.status_code == 200
    r_gen_put = await client.put("/api/settings", json={
        "workspaceName": "ObserveX Staging",
        "defaultEnvironment": "staging",
        "defaultTimeRange": "1h"
    })
    assert r_gen_put.status_code == 200
    assert r_gen_put.json()["workspaceName"] == "ObserveX Staging"

    # 2. Notification settings
    r_notif = await client.get("/api/settings/notifications")
    assert r_notif.status_code == 200
    r_notif_put = await client.put("/api/settings/notifications", json={
        "incidentUpdates": True,
        "alertDigests": False,
        "weeklySloReport": True
    })
    assert r_notif_put.status_code == 200
    assert r_notif_put.json()["alertDigests"] is False

    # 3. Team members
    r_team = await client.get("/api/settings/team")
    assert r_team.status_code == 200

    r_tm_add = await client.post("/api/settings/team", json={
        "name": "Devin Coder",
        "email": "devin@observex.dev",
        "role": "Editor"
    })
    assert r_tm_add.status_code == 200
    tm_id = r_tm_add.json()["id"]

    r_tm_up = await client.put(f"/api/settings/team/{tm_id}", json={"role": "Admin", "status": "Active"})
    assert r_tm_up.status_code == 200
    assert r_tm_up.json()["role"] == "Admin"

    r_tm_del = await client.delete(f"/api/settings/team/{tm_id}")
    assert r_tm_del.status_code == 200

    # 4. API keys
    r_key_add = await client.post("/api/settings/apikeys", json={"name": "Kubernetes Ingest Key"})
    assert r_key_add.status_code == 200
    key_data = r_key_add.json()
    assert "apiKey" in key_data
    assert key_data["apiKey"].startswith("obx_live_")
    key_id = key_data["id"]

    r_keys_list = await client.get("/api/settings/apikeys")
    assert r_keys_list.status_code == 200
    assert any(k["id"] == key_id for k in r_keys_list.json())

    r_key_del = await client.delete(f"/api/settings/apikeys/{key_id}")
    assert r_key_del.status_code == 200

@pytest.mark.asyncio
async def test_loadtest_manager(client: AsyncClient):
    # 1. Start load test
    r_start = await client.post("/api/loadtest/start", json={
        "endpoints": ["/"],
        "rps": 5,
        "duration": 2,
        "concurrency": 2,
        "latency": 0,
        "errorRate": 0,
        "cpuSpike": False
    })
    assert r_start.status_code == 200

    # 2. Get status while running
    r_status = await client.get("/api/loadtest/status")
    assert r_status.status_code == 200
    assert r_status.json()["running"] is True

    # 3. Stop load test
    r_stop = await client.post("/api/loadtest/stop")
    assert r_stop.status_code == 200

    r_status2 = await client.get("/api/loadtest/status")
    assert r_status2.status_code == 200
    assert r_status2.json()["running"] is False

    # 4. List past runs
    r_runs = await client.get("/api/loadtest/runs")
    assert r_runs.status_code == 200
    assert len(r_runs.json()) >= 1


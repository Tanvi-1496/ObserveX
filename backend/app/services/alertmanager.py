import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
# pyrefly: ignore[missing-import]
import httpx
from app.config import settings

async def fetch_alertmanager_alerts() -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.alertmanager_url}/api/v2/alerts",
                timeout=settings.request_timeout_seconds
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"Error fetching alerts from Alertmanager: {e}")
    return []

async def create_alertmanager_silence(
    matchers: List[Dict[str, str]],
    duration_minutes: int = 60,
    author: str = "ObserveX User",
    comment: str = "Silenced via ObserveX Console"
) -> Optional[str]:
    now = datetime.now(timezone.utc)
    ends_at = now + timedelta(minutes=duration_minutes)

    payload = {
        "matchers": [
            {
                "name": m.get("name", "alertname"),
                "value": m.get("value", ""),
                "isRegex": False,
                "isEqual": True
            }
            for m in matchers
        ],
        "startsAt": now.isoformat(),
        "endsAt": ends_at.isoformat(),
        "createdBy": author,
        "comment": comment
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.alertmanager_url}/api/v2/silences",
                json=payload,
                timeout=settings.request_timeout_seconds
            )
            if resp.status_code in [200, 201]:
                return resp.json().get("silenceID")
    except Exception as e:
        print(f"Error creating silence in Alertmanager: {e}")
    return None

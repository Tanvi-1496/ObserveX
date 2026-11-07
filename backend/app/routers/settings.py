import time
import json
import secrets
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore[missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore[missing-import]
from sqlalchemy import select, delete
# pyrefly: ignore[missing-import]
import httpx

from app.db import get_db
from app.models.setting import SettingModel, TeamMemberModel, ApiKeyModel
from app.schemas.settings import (
    GeneralSettings,
    NotificationSettings,
    TeamMember,
    TeamMemberCreate,
    TeamMemberUpdate,
    ApiKey,
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ConnectionTestRequest,
    ConnectionTestResponse,
)

router = APIRouter(prefix="/api", tags=["settings"])

# ----------------- General Settings -----------------
@router.get("/settings", response_model=GeneralSettings)
async def get_general_settings(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SettingModel).where(SettingModel.key == "general"))
    row = res.scalar_one_or_none()
    if row:
        try:
            return GeneralSettings(**json.loads(row.value))
        except Exception:
            pass
    return GeneralSettings()

@router.put("/settings", response_model=GeneralSettings)
async def update_general_settings(data: GeneralSettings, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SettingModel).where(SettingModel.key == "general"))
    row = res.scalar_one_or_none()
    val_json = json.dumps(data.model_dump())
    if row:
        row.value = val_json
    else:
        db.add(SettingModel(key="general", value=val_json))
    await db.commit()
    return data

# ----------------- Notifications Settings -----------------
@router.get("/settings/notifications", response_model=NotificationSettings)
async def get_notifications_settings(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SettingModel).where(SettingModel.key == "notifications"))
    row = res.scalar_one_or_none()
    if row:
        try:
            return NotificationSettings(**json.loads(row.value))
        except Exception:
            pass
    return NotificationSettings()

@router.put("/settings/notifications", response_model=NotificationSettings)
async def update_notifications_settings(data: NotificationSettings, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SettingModel).where(SettingModel.key == "notifications"))
    row = res.scalar_one_or_none()
    val_json = json.dumps(data.model_dump())
    if row:
        row.value = val_json
    else:
        db.add(SettingModel(key="notifications", value=val_json))
    await db.commit()
    return data

# ----------------- Data Sources -----------------
DEFAULT_DATASOURCES = {
    "Prometheus": "http://prometheus:9090",
    "Loki": "http://loki:3100",
    "Jaeger": "http://jaeger:16686"
}

@router.get("/settings/datasources")
async def get_datasources(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SettingModel).where(SettingModel.key == "datasources"))
    row = res.scalar_one_or_none()
    if row:
        try:
            return json.loads(row.value)
        except Exception:
            pass
    return DEFAULT_DATASOURCES

@router.put("/settings/datasources")
async def update_datasources(data: Dict[str, str], db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SettingModel).where(SettingModel.key == "datasources"))
    row = res.scalar_one_or_none()
    val_json = json.dumps(data)
    if row:
        row.value = val_json
    else:
        db.add(SettingModel(key="datasources", value=val_json))
    await db.commit()
    return {"ok": True, "datasources": data}

@router.post("/connections/test", response_model=ConnectionTestResponse)
async def test_connection(req: ConnectionTestRequest):
    t0 = time.time()
    url = req.url.strip()
    
    # Map common health endpoints if root tested
    test_url = url
    if "9090" in url and not url.endswith("/-/healthy") and not "/api" in url:
        test_url = f"{url.rstrip('/')}/-/healthy"
    elif "3100" in url and not url.endswith("/ready"):
        test_url = f"{url.rstrip('/')}/ready"
    elif "9093" in url and not url.endswith("/-/healthy"):
        test_url = f"{url.rstrip('/')}/-/healthy"

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(test_url)
            dur_ms = max(1, int((time.time() - t0) * 1000))
            if resp.status_code in [200, 204]:
                return ConnectionTestResponse(ok=True, latency=dur_ms, message=f"Connected successfully ({dur_ms}ms)")
            else:
                return ConnectionTestResponse(ok=False, latency=dur_ms, message=f"Service responded with status {resp.status_code}")
    except Exception as e:
        dur_ms = max(1, int((time.time() - t0) * 1000))
        return ConnectionTestResponse(ok=False, latency=dur_ms, message=str(e))

# ----------------- Team & Roles -----------------
@router.get("/settings/team", response_model=List[TeamMember])
async def list_team_members(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(TeamMemberModel).order_by(TeamMemberModel.created_at))
    members = res.scalars().all()
    return [
        TeamMember(
            id=m.id,
            name=m.name,
            email=m.email,
            role=m.role,
            status=m.status,
            createdAt=m.created_at
        )
        for m in members
    ]

@router.post("/settings/team", response_model=TeamMember)
async def create_team_member(data: TeamMemberCreate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(TeamMemberModel).where(TeamMemberModel.email == data.email.strip().lower()))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Team member with this email already exists")

    new_id = f"tm-{secrets.token_hex(4)}"
    member = TeamMemberModel(
        id=new_id,
        name=data.name.strip(),
        email=data.email.strip().lower(),
        role=data.role,
        status="Invited",
        created_at=datetime.now(timezone.utc).isoformat()
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return TeamMember(
        id=member.id,
        name=member.name,
        email=member.email,
        role=member.role,
        status=member.status,
        createdAt=member.created_at
    )

@router.put("/settings/team/{id}", response_model=TeamMember)
async def update_team_member(id: str, data: TeamMemberUpdate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(TeamMemberModel).where(TeamMemberModel.id == id))
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")

    if data.name is not None:
        member.name = data.name.strip()
    if data.role is not None:
        member.role = data.role
    if data.status is not None:
        member.status = data.status

    await db.commit()
    await db.refresh(member)
    return TeamMember(
        id=member.id,
        name=member.name,
        email=member.email,
        role=member.role,
        status=member.status,
        createdAt=member.created_at
    )

@router.delete("/settings/team/{id}")
async def delete_team_member(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(TeamMemberModel).where(TeamMemberModel.id == id))
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")

    await db.delete(member)
    await db.commit()
    return {"ok": True, "message": "Team member removed"}

# ----------------- API Keys -----------------
@router.get("/settings/apikeys", response_model=List[ApiKey])
async def list_api_keys(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ApiKeyModel).order_by(ApiKeyModel.created_at.desc()))
    keys = res.scalars().all()
    return [
        ApiKey(
            id=k.id,
            name=k.name,
            maskedKey=k.masked_key,
            createdAt=k.created_at,
            lastUsed=k.last_used
        )
        for k in keys
    ]

@router.post("/settings/apikeys", response_model=ApiKeyCreatedResponse)
async def create_api_key(data: ApiKeyCreate, db: AsyncSession = Depends(get_db)):
    raw_secret = f"obx_live_{secrets.token_urlsafe(24)}"
    masked = f"obx_live_••••••{raw_secret[-4:]}"
    key_hash = hashlib.sha256(raw_secret.encode("utf-8")).hexdigest()
    key_id = f"key-{secrets.token_hex(4)}"

    now_iso = datetime.now(timezone.utc).isoformat()
    record = ApiKeyModel(
        id=key_id,
        name=data.name.strip() or "Default Key",
        masked_key=masked,
        key_hash=key_hash,
        created_at=now_iso,
        last_used=None
    )
    db.add(record)
    await db.commit()

    return ApiKeyCreatedResponse(
        id=key_id,
        name=record.name,
        apiKey=raw_secret,
        maskedKey=masked,
        createdAt=now_iso
    )

@router.delete("/settings/apikeys/{id}")
async def delete_api_key(id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ApiKeyModel).where(ApiKeyModel.id == id))
    key = res.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    await db.delete(key)
    await db.commit()
    return {"ok": True, "message": "API key revoked"}

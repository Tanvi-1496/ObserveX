# pyrefly: ignore[missing-import]
from sqlalchemy import Column, String, Boolean, Text
from app.db import Base

class SettingModel(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(Text, nullable=False)

class TeamMemberModel(Base):
    __tablename__ = "team_members"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    role = Column(String, default="Viewer")  # Admin, Editor, Viewer
    status = Column(String, default="Active")  # Active, Invited
    created_at = Column(String, nullable=False)

class ApiKeyModel(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    masked_key = Column(String, nullable=False)  # obx_live_••••••92kf
    key_hash = Column(String, nullable=False)  # SHA-256 hash
    created_at = Column(String, nullable=False)
    last_used = Column(String, nullable=True)

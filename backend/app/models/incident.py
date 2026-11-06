# pyrefly: ignore[missing-import]
from sqlalchemy import Column, String, Text
from app.db import Base

class IncidentModel(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    severity = Column(String, default="warning")
    status = Column(String, default="Open")  # 'Open' | 'Investigating' | 'Resolved'
    endpoint = Column(String, default="/")
    started_at = Column(String, nullable=False)
    resolved_at = Column(String, nullable=True)
    assignee = Column(String, default="Unassigned")
    timeline_json = Column(Text, default="[]")
    comments_json = Column(Text, default="[]")
    resolution_summary = Column(Text, nullable=True)

# pyrefly: ignore[missing-import]
from sqlalchemy import Column, String, Float
from app.db import Base

class AlertModel(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    endpoint = Column(String, default="/")
    value = Column(Float, default=0.0)
    threshold = Column(Float, default=0.0)
    unit = Column(String, default="%")
    since = Column(String, nullable=False)
    status = Column(String, default="firing")  # 'firing' | 'acknowledged' | 'silenced'
    incident_id = Column(String, nullable=True)
    fingerprint = Column(String, nullable=True, index=True)
    silenced_until = Column(String, nullable=True)

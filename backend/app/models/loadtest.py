# pyrefly: ignore[missing-import]
from sqlalchemy import Column, String, Integer, Float, Boolean, Text
from app.db import Base

class LoadTestRunModel(Base):
    __tablename__ = "load_test_runs"

    id = Column(String, primary_key=True, index=True)
    endpoints_json = Column(Text, nullable=False)
    rps = Column(Integer, default=120)
    duration = Column(Integer, default=60)
    concurrency = Column(Integer, default=20)
    latency = Column(Integer, default=0)
    error_rate = Column(Float, default=0.0)
    cpu_spike = Column(Boolean, default=False)
    total_requests = Column(Integer, default=0)
    avg_latency = Column(Float, default=0.0)
    error_percent = Column(Float, default=0.0)
    alerts_triggered = Column(Integer, default=0)
    created_at = Column(String, nullable=False)

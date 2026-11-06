from sqlalchemy import Column, String, Float, Boolean
from app.db import Base

class AlertRuleModel(Base):
    __tablename__ = "alert_rules"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    query = Column(String, nullable=False)
    condition = Column(String, default=">")
    threshold = Column(Float, nullable=False)
    duration = Column(String, default="5m")
    severity = Column(String, default="critical")
    enabled = Column(Boolean, default=True)

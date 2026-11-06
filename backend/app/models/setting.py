from sqlalchemy import Column, String, Boolean
from app.db import Base

class SettingModel(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)

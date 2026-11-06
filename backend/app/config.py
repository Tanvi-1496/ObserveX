import os
# pyrefly: ignore[missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    prometheus_url: str = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
    loki_url: str = os.getenv("LOKI_URL", "http://loki:3100")
    jaeger_url: str = os.getenv("JAEGER_URL", "http://jaeger:16686")
    alertmanager_url: str = os.getenv("ALERTMANAGER_URL", "http://alertmanager:9093")
    demo_app_url: str = os.getenv("DEMO_APP_URL", "http://demo-app:5000")

    sqlite_db_path: str = os.getenv("SQLITE_DB_PATH", "/app/data/observex.db")
    prometheus_rules_path: str = os.getenv("PROMETHEUS_RULES_PATH", "/etc/prometheus/rules/observex.yml")

    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "*")
    cache_ttl_seconds: int = 3
    request_timeout_seconds: float = 8.0

settings = Settings()

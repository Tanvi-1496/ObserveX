import asyncio
import time
import json
import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
# pyrefly: ignore[missing-import]
import httpx

from app.config import settings
import app.db
from app.models.loadtest import LoadTestRunModel
from app.schemas.loadtest import LoadTestConfig, LoadTestStatus, LoadTestRunRecord

class LoadTestManager:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.running: bool = False
        self.current_task: Optional[asyncio.Task] = None
        self.config: Optional[LoadTestConfig] = None
        self.start_time: float = 0.0
        self.requests_sent: int = 0
        self.recent_timestamps: List[float] = []
        self.latencies: List[float] = []
        self.error_count: int = 0
        self.progress: float = 0.0

    async def get_status(self) -> LoadTestStatus:
        async with self.lock:
            if not self.running or not self.config:
                return LoadTestStatus(
                    running=False,
                    progress=0.0,
                    config=None,
                    requestsSent=0,
                    currentRps=0.0,
                    currentLatency=0.0,
                    currentErrors=0.0
                )

            now = time.time()
            elapsed = now - self.start_time
            progress = min(100.0, (elapsed / max(1, self.config.duration)) * 100.0)

            # Rolling 2-second window for actual measured RPS
            self.recent_timestamps = [t for t in self.recent_timestamps if now - t <= 2.0]
            measured_rps = len(self.recent_timestamps) / 2.0 if self.recent_timestamps else 0.0

            # Rolling 30 requests for current latency
            recent_lats = self.latencies[-30:] if self.latencies else []
            avg_lat = sum(recent_lats) / max(1, len(recent_lats)) if recent_lats else float(self.config.latency)

            # Overall error percentage
            err_pct = (self.error_count / max(1, self.requests_sent)) * 100.0 if self.requests_sent > 0 else float(self.config.errorRate)

            return LoadTestStatus(
                running=True,
                progress=round(progress, 1),
                config=self.config,
                requestsSent=self.requests_sent,
                currentRps=round(max(measured_rps, float(self.config.rps if elapsed < 1.0 else measured_rps)), 1),
                currentLatency=round(avg_lat, 1),
                currentErrors=round(err_pct, 1)
            )

    async def start(self, config: LoadTestConfig) -> Dict[str, Any]:
        async with self.lock:
            if self.running:
                await self._stop_locked()

            self.config = config
            self.running = True
            self.start_time = time.time()
            self.requests_sent = 0
            self.recent_timestamps = []
            self.latencies = []
            self.error_count = 0
            self.progress = 0.0

            # Configure chaos in demo-app
            await self._set_demo_chaos(config.latency, config.errorRate, config.cpuSpike, ttl=config.duration + 10)

            # Spawn load generator task
            self.current_task = asyncio.create_task(self._run_generator())

            return {"ok": True, "message": "Load test started"}

    async def stop(self) -> Dict[str, Any]:
        async with self.lock:
            if not self.running:
                return {"ok": True, "message": "Load test not running"}
            await self._stop_locked()
            return {"ok": True, "message": "Load test stopped"}

    async def _stop_locked(self):
        """Must be called while holding self.lock."""
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()
            self.current_task = None

        if self.running and self.config:
            await self._save_run_summary()

        self.running = False
        # Reset chaos in demo-app
        await self._set_demo_chaos(0, 0, False, ttl=0)

    async def _set_demo_chaos(self, latency_ms: int, error_rate: float, cpu_spike: bool, ttl: int):
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.demo_app_url}/admin/chaos",
                    json={
                        "latencyMs": latency_ms,
                        "errorRate": error_rate,
                        "cpuSpike": cpu_spike,
                        "ttlSeconds": ttl
                    }
                )
        except Exception as e:
            print(f"Warning: Failed to set chaos on demo-app: {e}")

    async def _run_generator(self):
        config = self.config
        if not config:
            return

        concurrency_limit = max(1, config.concurrency)
        semaphore = asyncio.Semaphore(concurrency_limit)
        client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=2.0),
            limits=httpx.Limits(max_connections=concurrency_limit * 2, max_keepalive_connections=concurrency_limit)
        )

        target_eps = config.endpoints if config.endpoints else ["/"]
        rps = max(1, config.rps)
        duration = config.duration
        end_time = self.start_time + duration
        interval = 1.0 / rps

        async def send_worker(ep: str):
            async with semaphore:
                t0 = time.time()
                try:
                    res = await client.get(f"{settings.demo_app_url}{ep}")
                    now = time.time()
                    dur_ms = (now - t0) * 1000.0
                    self.latencies.append(dur_ms)
                    self.requests_sent += 1
                    self.recent_timestamps.append(now)
                    if res.status_code >= 500:
                        self.error_count += 1
                except Exception:
                    now = time.time()
                    dur_ms = (now - t0) * 1000.0
                    self.latencies.append(dur_ms)
                    self.requests_sent += 1
                    self.recent_timestamps.append(now)
                    self.error_count += 1

        active_workers = []
        try:
            while time.time() < end_time and self.running:
                ep = random.choice(target_eps)
                task = asyncio.create_task(send_worker(ep))
                active_workers.append(task)
                if len(active_workers) > concurrency_limit * 3:
                    active_workers = [t for t in active_workers if not t.done()]
                await asyncio.sleep(interval)

            if active_workers:
                await asyncio.gather(*[t for t in active_workers if not t.done()], return_exceptions=True)
        except asyncio.CancelledError:
            pass
        finally:
            await client.aclose()
            # If still marked running when loop finished naturally:
            async with self.lock:
                if self.running:
                    await self._stop_locked()

    async def _save_run_summary(self):
        try:
            if not self.config:
                return
            avg_lat = sum(self.latencies) / max(1, len(self.latencies)) if self.latencies else float(self.config.latency)
            err_pct = (self.error_count / max(1, self.requests_sent)) * 100.0 if self.requests_sent > 0 else float(self.config.errorRate)

            run_id = f"LT-{int(time.time()) % 10000}"
            async with app.db.AsyncSessionLocal() as session:
                record = LoadTestRunModel(
                    id=run_id,
                    endpoints_json=json.dumps(self.config.endpoints),
                    rps=self.config.rps,
                    duration=self.config.duration,
                    concurrency=self.config.concurrency,
                    latency=self.config.latency,
                    error_rate=self.config.errorRate,
                    cpu_spike=self.config.cpuSpike,
                    total_requests=self.requests_sent,
                    avg_latency=round(avg_lat, 1),
                    error_percent=round(err_pct, 1),
                    alerts_triggered=1 if err_pct > 5.0 or avg_lat > 1000 else 0,
                    created_at=datetime.now(timezone.utc).isoformat()
                )
                session.add(record)
                await session.commit()
        except Exception as e:
            print(f"Error saving load test run summary: {e}")

load_test_manager = LoadTestManager()

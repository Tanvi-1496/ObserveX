import os
import time
import json
import random
import threading
import logging
from datetime import datetime, timezone
from typing import Optional

# pyrefly: ignore[missing-import]
from flask import Flask, request, jsonify, Response
# pyrefly: ignore[missing-import]
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# pyrefly: ignore[missing-import]
from opentelemetry import trace
# pyrefly: ignore[missing-import]
from opentelemetry.sdk.trace import TracerProvider
# pyrefly: ignore[missing-import]
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor
# pyrefly: ignore[missing-import]
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
# pyrefly: ignore[missing-import]
from opentelemetry.sdk.resources import Resource
# pyrefly: ignore[missing-import]
from opentelemetry.instrumentation.flask import FlaskInstrumentor
# pyrefly: ignore[missing-import]
from opentelemetry.trace import Status, StatusCode

# Setup OpenTelemetry
service_name = os.getenv("OTEL_SERVICE_NAME", "demo-flask-app")
otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://jaeger:4318/v1/traces")

resource = Resource.create({"service.name": service_name, "service.version": "1.4.2"})
provider = TracerProvider(resource=resource)
try:
    exporter = OTLPSpanExporter(endpoint=otlp_endpoint, timeout=5)
    # Using SimpleSpanProcessor for demo responsiveness or BatchSpanProcessor
    provider.add_span_processor(BatchSpanProcessor(exporter, max_queue_size=2048, schedule_delay_millis=500))
except Exception as e:
    print(f"Warning: Failed to init OTLP exporter: {e}")

trace.set_tracer_provider(provider)
tracer = trace.get_tracer("demo-app")

app = Flask(__name__)
FlaskInstrumentor().instrument_app(app)

# Prometheus Metrics
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests handled",
    ["endpoint", "method", "status"],
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["endpoint"],
    buckets=[0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0],
)
IN_FLIGHT_REQUESTS = Gauge(
    "in_flight_requests",
    "Current in-flight requests",
)

# File and Stdout Logger
LOG_DIR = os.getenv("LOG_DIR", "/var/log/app")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE_PATH = os.path.join(LOG_DIR, "app.log")

log_lock = threading.Lock()

def write_structured_log(level: str, endpoint: str, message: str, trace_id: str, status: int, duration_ms: float):
    now_iso = datetime.now(timezone.utc).isoformat()
    entry = {
        "timestamp": now_iso,
        "level": level,
        "endpoint": endpoint,
        "message": message,
        "trace_id": trace_id,
        "status": status,
        "duration_ms": round(duration_ms, 2)
    }
    line = json.dumps(entry)
    print(line, flush=True)
    try:
        with log_lock:
            with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
                f.write(line + "\n")
    except Exception as ex:
        print(f"Error writing to {LOG_FILE_PATH}: {ex}", flush=True)

# Chaos Configuration State
chaos_lock = threading.Lock()
chaos_state = {
    "latencyMs": 0,
    "errorRate": 0,
    "cpuSpike": False,
    "expiresAt": 0.0,
}

def get_active_chaos():
    with chaos_lock:
        if chaos_state["expiresAt"] > 0 and time.time() > chaos_state["expiresAt"]:
            chaos_state["latencyMs"] = 0
            chaos_state["errorRate"] = 0
            chaos_state["cpuSpike"] = False
            chaos_state["expiresAt"] = 0.0
        return dict(chaos_state)

def apply_chaos():
    active = get_active_chaos()
    if active["latencyMs"] > 0:
        time.sleep(active["latencyMs"] / 1000.0)
    
    if active["cpuSpike"]:
        # Busy spin for 100ms
        end = time.time() + 0.1
        while time.time() < end:
            _ = 3.14159 * 2.71828

    if active["errorRate"] > 0:
        if random.random() * 100.0 < active["errorRate"]:
            return True  # Chaos triggered error
    return False

def get_current_trace_id() -> str:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx and ctx.is_valid:
        return format(ctx.trace_id, "032x")
    return format(random.getrandbits(128), "032x")

@app.before_request
def before_req():
    request.start_time = time.time()
    IN_FLIGHT_REQUESTS.inc()

@app.after_request
def after_req(response):
    IN_FLIGHT_REQUESTS.dec()
    duration_s = time.time() - getattr(request, "start_time", time.time())
    duration_ms = duration_s * 1000.0
    endpoint = request.path
    method = request.method
    status = response.status_code

    if endpoint not in ["/metrics", "/healthz", "/admin/chaos"]:
        HTTP_REQUESTS_TOTAL.labels(endpoint=endpoint, method=method, status=str(status)).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(endpoint=endpoint).observe(duration_s)

        tid = get_current_trace_id()
        if status >= 500:
            level = "ERROR"
            msg = "Simulated database timeout" if endpoint == "/error" or endpoint == "/orders" else "Internal server error encountered"
        elif duration_ms > 1500 or endpoint == "/slow":
            level = "WARN"
            msg = "Slow response detected"
        elif random.random() < 0.1:
            level = "DEBUG"
            msg = "Worker processed request"
        else:
            level = "INFO"
            messages = [
                "Request completed",
                "Cache miss, fetched from database",
                "Request validation passed",
                "Worker processed request"
            ]
            msg = random.choice(messages)

        write_structured_log(
            level=level,
            endpoint=endpoint,
            message=msg,
            trace_id=tid,
            status=status,
            duration_ms=duration_ms,
        )

    return response

@app.route("/")
def index():
    chaos_err = apply_chaos()
    if chaos_err:
        return jsonify({"error": "Chaos error injected", "endpoint": "/"}), 500
    # fast (<50ms)
    time.sleep(random.uniform(0.010, 0.040))
    return jsonify({"message": "ObserveX Demo Flask App", "version": "1.4.2", "status": "operational"})

@app.route("/orders")
def orders():
    chaos_err = apply_chaos()
    if chaos_err:
        return jsonify({"error": "Chaos error injected on /orders", "endpoint": "/orders"}), 500

    base_duration = random.uniform(0.150, 0.300)
    
    # Simulated db.query span
    with tracer.start_as_current_span("db.query orders") as db_span:
        db_span.set_attribute("component", "psycopg")
        db_span.set_attribute("db.system", "postgresql")
        db_span.set_attribute("db.statement", "SELECT * FROM orders ORDER BY created_at DESC LIMIT 50")
        time.sleep(base_duration * 0.75)
        
        # Nested cache.lookup span
        with tracer.start_as_current_span("cache.lookup") as cache_span:
            cache_span.set_attribute("service.name", "redis")
            cache_span.set_attribute("component", "redis")
            cache_hit = random.choice([True, False, True])
            cache_span.set_attribute("cache.hit", str(cache_hit).lower())
            time.sleep(min(0.015, base_duration * 0.1))

    return jsonify({
        "orders": [
            {"id": "ord-101", "total": 129.50, "status": "completed"},
            {"id": "ord-102", "total": 45.00, "status": "pending"},
            {"id": "ord-103", "total": 890.00, "status": "completed"}
        ],
        "cached": cache_hit
    })

@app.route("/slow")
def slow():
    chaos_err = apply_chaos()
    if chaos_err:
        return jsonify({"error": "Chaos error injected on /slow", "endpoint": "/slow"}), 500
    
    # 1.0 - 3.0s latency
    delay = random.uniform(1.0, 3.0)
    time.sleep(delay)
    return jsonify({"status": "slow_completed", "duration_ms": round(delay * 1000, 2)})

@app.route("/error")
def error():
    chaos_err = apply_chaos()
    # 25% base error rate or chaos error
    if chaos_err or random.random() < 0.25:
        span = trace.get_current_span()
        span.set_status(Status(StatusCode.ERROR, "Simulated database timeout"))
        span.record_exception(Exception("Connection timeout to PostgreSQL read replica"))
        return jsonify({"error": "Simulated database timeout", "status": 500, "endpoint": "/error"}), 500
    
    time.sleep(random.uniform(0.05, 0.15))
    return jsonify({"status": "recovered", "endpoint": "/error"})

@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok", "service": "demo-flask-app", "uptime": "healthy"}), 200

@app.route("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

@app.route("/admin/chaos", methods=["GET", "POST"])
def admin_chaos():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        latency_ms = int(data.get("latencyMs", 0))
        error_rate = float(data.get("errorRate", 0))
        cpu_spike = bool(data.get("cpuSpike", False))
        ttl_seconds = int(data.get("ttlSeconds", 300))  # Default 5 minutes TTL

        with chaos_lock:
            chaos_state["latencyMs"] = latency_ms
            chaos_state["errorRate"] = error_rate
            chaos_state["cpuSpike"] = cpu_spike
            chaos_state["expiresAt"] = time.time() + ttl_seconds if (latency_ms > 0 or error_rate > 0 or cpu_spike) else 0.0

        return jsonify({"status": "updated", "chaos": get_active_chaos()})
    else:
        return jsonify(get_active_chaos())

# Background generator for light realistic telemetry traffic
def background_traffic():
    time.sleep(3)
    endpoints = ["/", "/orders", "/orders", "/", "/slow", "/error"]
    while True:
        try:
            ep = random.choice(endpoints)
            with app.test_client() as client:
                client.get(ep)
        except Exception:
            pass
        time.sleep(random.uniform(2.0, 5.0))

bg_thread = threading.Thread(target=background_traffic, daemon=True)
bg_thread.start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    LOG_DIR=/var/log/app \
    OTEL_SERVICE_NAME=demo-flask-app \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces

RUN mkdir -p /var/log/app && chmod 777 /var/log/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/healthz')" || exit 1

CMD ["python", "app.py"]

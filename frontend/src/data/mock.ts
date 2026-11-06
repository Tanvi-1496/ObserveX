import type { Alert, AlertRule, Incident, LoadTestConfig, LogEntry, MetricPoint, Service, Trace } from '../types'

export const endpoints = ['/', '/orders', '/slow', '/error']
export const rangeMinutes = { '5m': 5, '15m': 15, '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 }

const hash = (value: number) => {
  const x = Math.sin(value * 999) * 10000
  return x - Math.floor(x)
}

export function generateMetrics(minutes: number, load?: LoadTestConfig | null): MetricPoint[] {
  const count = minutes <= 60 ? 48 : minutes <= 360 ? 60 : 72
  const now = Date.now()
  const loadFactor = load ? 1 + load.rps / 100 : 1
  return Array.from({ length: count }, (_, i): MetricPoint => {
    const timestamp = now - ((count - 1 - i) / (count - 1)) * minutes * 60_000
    const wave = Math.sin(i / 5) * 9
    const requests = Math.round((120 + wave + hash(i) * 12) * loadFactor)
    const errors = Math.max(0.5, 2.1 + Math.sin(i / 7) * 0.7 + (load?.errorRate ?? 0) * 0.8)
    const latency = Math.round(175 + Math.sin(i / 6) * 25 + hash(i + 2) * 24 + (load?.latency ?? 0) * 0.65)
    return {
      time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp,
      requests,
      errors: +errors.toFixed(1),
      latency,
      p50: Math.round(latency * 0.72),
      p95: Math.round(latency * 1.9),
      p99: Math.round(latency * 2.7),
      cpu: Math.round(28 + hash(i + 5) * 18 + (load?.cpuSpike ? 48 : 0)),
      memory: Math.round(380 + hash(i + 9) * 80),
    }
  })
}

const traceId = (i: number) => `${(0xa1b2c3d4 + i * 7919).toString(16)}${(0xe5f6a7b8 + i * 3571).toString(16)}`.slice(0, 16)

export function generateTraces(minutes: number, load?: LoadTestConfig | null): Trace[] {
  const count = Math.max(140, Math.min(620, Math.round(minutes / 3)))
  const now = Date.now()
  return Array.from({ length: count }, (_, i): Trace => {
    const endpoint = endpoints[i % endpoints.length]
    const error = endpoint === '/error' && i % 4 === 0 || Boolean(load && i % Math.max(2, Math.round(100 / Math.max(1, load.errorRate))) === 0)
    const base = endpoint === '/' ? 28 : endpoint === '/orders' ? 220 : endpoint === '/slow' ? 1000 + hash(i) * 2000 : 160
    const duration = Math.round(base + hash(i + 4) * base * .25 + (load?.latency ?? 0))
    const startTime = new Date(now - hash(i + 11) * minutes * 60_000).toISOString()
    const id = traceId(i)
    const status: Trace['status'] = error ? 'error' : 'ok'
    return {
      id, endpoint, operation: `GET ${endpoint}`, startTime, duration, status,
      spans: [
        { id: `${id}-1`, operation: `GET ${endpoint}`, service: 'demo-flask-app', start: 0, duration, status, tags: { 'http.method': 'GET', 'http.route': endpoint, 'http.status_code': error ? 500 : 200 } },
        { id: `${id}-2`, parentId: `${id}-1`, operation: endpoint === '/orders' ? 'db.query orders' : 'flask.request', service: endpoint === '/orders' ? 'postgres' : 'demo-flask-app', start: 14, duration: Math.round(duration * .76), status, tags: { component: endpoint === '/orders' ? 'psycopg' : 'flask', error: String(error) } },
        { id: `${id}-3`, parentId: `${id}-2`, operation: 'cache.lookup', service: 'redis', start: 28, duration: Math.min(16, Math.round(duration * .1)), status: 'ok', tags: { 'cache.hit': i % 3 ? 'true' : 'false' } },
      ],
    }
  }).sort((a, b) => b.startTime.localeCompare(a.startTime))
}

export function generateLogs(minutes: number, load?: LoadTestConfig | null): LogEntry[] {
  const traces = generateTraces(minutes, load)
  const count = Math.max(540, Math.min(900, Math.round(minutes * 2)))
  const messages = ['Request completed', 'Cache miss, fetched from database', 'Request validation passed', 'Worker processed request']
  return Array.from({ length: count }, (_, i): LogEntry => {
    const trace = traces[i % traces.length]
    const isError = trace.status === 'error' && i % 2 === 0
    const isWarn = trace.endpoint === '/slow' && i % 3 === 0
    const level: LogEntry['level'] = isError ? 'ERROR' : isWarn ? 'WARN' : i % 8 === 0 ? 'DEBUG' : 'INFO'
    return {
      id: `log-${i}`, timestamp: new Date(new Date(trace.startTime).getTime() + i % 400).toISOString(),
      level, endpoint: trace.endpoint,
      message: isError ? 'Simulated database timeout' : isWarn ? 'Slow response detected' : messages[i % messages.length],
      traceId: trace.id, status: isError ? 500 : 200, duration: trace.duration,
    }
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export const initialAlerts: Alert[] = [
  { id: 'al-1', name: 'High error rate on /error', severity: 'critical', endpoint: '/error', value: 18, threshold: 5, unit: '%', since: new Date(Date.now() - 4 * 60_000).toISOString(), status: 'firing', incidentId: 'INC-1042' },
  { id: 'al-2', name: 'p95 latency elevated', severity: 'warning', endpoint: '/slow', value: 2.4, threshold: 1.5, unit: 's', since: new Date(Date.now() - 11 * 60_000).toISOString(), status: 'firing', incidentId: 'INC-1041' },
]

export const initialRules: AlertRule[] = [
  { id: 'rule-1', name: 'High error rate', query: 'rate(http_requests_total{status=~"5.."}[5m])', condition: '>', threshold: 5, duration: '5m', severity: 'critical', enabled: true },
  { id: 'rule-2', name: 'High p95 latency', query: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))', condition: '>', threshold: 1.5, duration: '10m', severity: 'warning', enabled: true },
  { id: 'rule-3', name: 'Container restarting', query: 'increase(kube_pod_container_status_restarts_total[10m])', condition: '>', threshold: 2, duration: '2m', severity: 'warning', enabled: true },
]

const timeline = (endpoint: string) => [
  { time: '14:28:02', title: 'Alert fired', description: `Threshold exceeded on ${endpoint}`, kind: 'alert' as const },
  { time: '14:28:18', title: 'Error rate spike', description: 'Error rate increased from 2.1% to 18%', kind: 'metric' as const },
  { time: '14:28:31', title: 'First error captured', description: 'Simulated database timeout', kind: 'log' as const },
  { time: '14:29:04', title: 'Slow traces detected', description: 'p95 duration crossed 1.5 seconds', kind: 'trace' as const },
  { time: '14:31:22', title: 'Acknowledged by Maya', description: 'Investigation started', kind: 'action' as const },
]

export const initialIncidents: Incident[] = [
  { id: 'INC-1042', title: 'Elevated errors on checkout API', severity: 'critical', status: 'Open', endpoint: '/error', startedAt: new Date(Date.now() - 24 * 60_000).toISOString(), assignee: 'Maya Chen', timeline: timeline('/error'), comments: [] },
  { id: 'INC-1041', title: 'Slow order retrieval', severity: 'warning', status: 'Investigating', endpoint: '/orders', startedAt: new Date(Date.now() - 73 * 60_000).toISOString(), assignee: 'Alex Kim', timeline: timeline('/orders'), comments: [] },
  { id: 'INC-1039', title: 'Intermittent service latency', severity: 'warning', status: 'Resolved', endpoint: '/slow', startedAt: new Date(Date.now() - 86400000).toISOString(), resolvedAt: new Date(Date.now() - 82000000).toISOString(), assignee: 'Priya Shah', timeline: timeline('/slow'), comments: [] },
  { id: 'INC-1037', title: 'Application restart loop', severity: 'critical', status: 'Resolved', endpoint: '/', startedAt: new Date(Date.now() - 172800000).toISOString(), resolvedAt: new Date(Date.now() - 170000000).toISOString(), assignee: 'Noah Lee', timeline: timeline('/'), comments: [] },
]

export const services: Service[] = ['Prometheus', 'Loki', 'Promtail', 'Jaeger', 'Grafana', 'Demo App'].map((name, i) => ({
  name, status: i === 5 ? 'Degraded' : 'Up', version: ['2.51.2', '3.0.0', '3.0.0', '1.57.0', '11.1.0', '1.4.2'][i],
  uptime: i === 5 ? '99.92%' : '99.99%', lastScrape: `${i + 2}s ago`, ingestion: `${(12.4 + i * 7.3).toFixed(1)}k/min`, url: '#',
}))

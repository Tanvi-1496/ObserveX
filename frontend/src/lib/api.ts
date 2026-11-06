import { generateLogs, generateMetrics, generateTraces, rangeMinutes, services } from '../data/mock'
import { useAppStore } from '../store/useAppStore'
import type { Alert, AlertRule, Incident, LoadTestConfig, LogEntry, RangeKey, Service, Trace } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

const wait = async () => new Promise(resolve => setTimeout(resolve, 320 + Math.random() * 220))
const context = () => useAppStore.getState()

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errJson = await response.json()
      errorDetail = errJson.message || errJson.error || errorDetail
    } catch {
      // ignore
    }
    throw new Error(`HTTP ${response.status}: ${errorDetail}`)
  }

  return response.json() as Promise<T>
}

// ==================== Metrics ====================
export async function getTimeseries(query: string, range: RangeKey) {
  if (USE_MOCK) {
    await wait()
    return generateMetrics(rangeMinutes[range], context().loadTest)
  }
  const params = new URLSearchParams({ query, range })
  return request<ReturnType<typeof generateMetrics>>(`/timeseries?${params.toString()}`)
}

export async function getKpis(range: RangeKey) {
  if (USE_MOCK) {
    const series = await getTimeseries('overview', range)
    const latest = series.at(-1)!
    return {
      requests: latest.requests,
      latency: latest.latency,
      p95: latest.p95,
      errors: latest.errors,
      uptime: 99.92,
      activeAlerts: context().alerts.filter(a => a.status === 'firing').length,
      series,
    }
  }
  return request<{
    requests: number
    latency: number
    p95: number
    errors: number
    uptime: number
    activeAlerts: number
    series: ReturnType<typeof generateMetrics>
  }>(`/kpis?range=${range}`)
}

export async function getMetricNames() {
  if (USE_MOCK) {
    return [
      { name: 'http_requests_total', type: 'counter' },
      { name: 'http_request_duration_seconds', type: 'histogram' },
      { name: 'process_cpu_seconds_total', type: 'counter' },
      { name: 'process_resident_memory_bytes', type: 'gauge' },
    ]
  }
  return request<{ name: string; type: string }[]>('/metrics/names')
}

// ==================== Logs ====================
export async function searchLogs(filters: { range: RangeKey; level?: string; endpoint?: string; text?: string; traceId?: string; limit?: number }) {
  if (USE_MOCK) {
    await wait()
    return generateLogs(rangeMinutes[filters.range], context().loadTest).filter(log =>
      (!filters.level || log.level === filters.level) &&
      (!filters.endpoint || log.endpoint === filters.endpoint) &&
      (!filters.text || log.message.toLowerCase().includes(filters.text.toLowerCase())) &&
      (!filters.traceId || log.traceId === filters.traceId))
  }

  const params = new URLSearchParams()
  params.set('range', filters.range)
  if (filters.level) params.set('level', filters.level)
  if (filters.endpoint) params.set('endpoint', filters.endpoint)
  if (filters.text) params.set('text', filters.text)
  if (filters.traceId) params.set('traceId', filters.traceId)
  if (filters.limit) params.set('limit', String(filters.limit))

  return request<LogEntry[]>(`/logs?${params.toString()}`)
}

export async function getLogVolume(range: RangeKey) {
  if (USE_MOCK) {
    return []
  }
  return request<{ time: string; timestamp: number; info: number; warn: number; error: number }[]>(`/logs/volume?range=${range}`)
}

export function subscribeLogTail(
  onMessage: (entry: LogEntry) => void,
  filters?: { level?: string; endpoint?: string; text?: string }
): () => void {
  const params = new URLSearchParams()
  if (filters?.level) params.set('level', filters.level)
  if (filters?.endpoint) params.set('endpoint', filters.endpoint)
  if (filters?.text) params.set('text', filters.text)

  const url = `${BASE_URL}/logs/tail?${params.toString()}`
  const es = new EventSource(url)

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as LogEntry
      onMessage(data)
    } catch (err) {
      console.error('Failed to parse SSE log message:', err)
    }
  }

  return () => {
    es.close()
  }
}

// ==================== Traces ====================
export async function searchTraces(filters: { range: RangeKey; endpoint?: string; status?: string; min?: number; max?: number; limit?: number }) {
  if (USE_MOCK) {
    await wait()
    return generateTraces(rangeMinutes[filters.range], context().loadTest).filter(t =>
      (!filters.endpoint || t.endpoint.includes(filters.endpoint)) &&
      (!filters.status || filters.status === 'all' || t.status === filters.status) &&
      (!filters.min || t.duration >= filters.min) && (!filters.max || t.duration <= filters.max)).slice(0, filters.limit ?? 100)
  }

  const params = new URLSearchParams()
  params.set('range', filters.range)
  if (filters.endpoint) params.set('endpoint', filters.endpoint)
  if (filters.status) params.set('status', filters.status)
  if (filters.min !== undefined) params.set('min', String(filters.min))
  if (filters.max !== undefined) params.set('max', String(filters.max))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))

  return request<Trace[]>(`/traces?${params.toString()}`)
}

export async function getTrace(id: string): Promise<Trace | undefined> {
  if (USE_MOCK) {
    await wait()
    return generateTraces(10080, context().loadTest).find(t => t.id === id)
  }
  try {
    return await request<Trace>(`/traces/${id}`)
  } catch (err) {
    return undefined
  }
}

// ==================== Alerts & Rules ====================
export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) {
    await wait()
    return context().alerts
  }
  return request<Alert[]>('/alerts')
}

export async function acknowledgeAlert(id: string) {
  if (USE_MOCK) {
    context().updateAlert(id, 'acknowledged')
    return { ok: true }
  }
  return request<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' })
}

export async function silenceAlert(id: string, minutes: number = 60) {
  if (USE_MOCK) {
    context().updateAlert(id, 'silenced')
    return { ok: true }
  }
  return request<Alert>(`/alerts/${id}/silence`, {
    method: 'POST',
    body: JSON.stringify({ minutes }),
  })
}

export async function getAlertRules(): Promise<AlertRule[]> {
  if (USE_MOCK) {
    return context().rules
  }
  return request<AlertRule[]>('/alert-rules')
}

export async function createAlertRule(rule: Omit<AlertRule, 'id'>) {
  if (USE_MOCK) {
    const newRule: AlertRule = { ...rule, id: `rule-${Date.now()}` }
    context().addRule(newRule)
    return newRule
  }
  return request<AlertRule>('/alert-rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  })
}

export async function updateAlertRule(id: string, patch: Partial<AlertRule>) {
  if (USE_MOCK) {
    return { ok: true }
  }
  return request<AlertRule>(`/alert-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function deleteAlertRule(id: string) {
  if (USE_MOCK) {
    context().deleteRule(id)
    return { ok: true }
  }
  return request<{ ok: boolean }>(`/alert-rules/${id}`, { method: 'DELETE' })
}

// ==================== Incidents ====================
export async function getIncidents(): Promise<Incident[]> {
  if (USE_MOCK) {
    await wait()
    return context().incidents
  }
  return request<Incident[]>('/incidents')
}

export async function updateIncident(id: string, patch: Partial<Incident>) {
  if (USE_MOCK) {
    context().updateIncident(id, patch)
    return { ok: true }
  }
  return request<Incident>(`/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function addIncidentComment(id: string, text: string, author: string = 'Jordan Lee') {
  if (USE_MOCK) {
    context().addComment(id, text)
    return { ok: true }
  }
  return request<Incident>(`/incidents/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text, author }),
  })
}

export async function resolveIncident(id: string, summary: string = '') {
  if (USE_MOCK) {
    context().updateIncident(id, { status: 'Resolved', resolvedAt: new Date().toISOString() })
    return { ok: true }
  }
  return request<Incident>(`/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  })
}

export async function getIncidentCorrelation(id: string) {
  if (USE_MOCK) {
    return null
  }
  return request<any>(`/incidents/${id}/correlation`)
}

export async function getIncidentPostmortem(id: string): Promise<string> {
  if (USE_MOCK) {
    return 'Post-mortem summary'
  }
  const res = await fetch(`${BASE_URL}/incidents/${id}/postmortem`)
  return res.text()
}

// ==================== Insights (AIOps) ====================
export async function getInsights(range: RangeKey) {
  if (USE_MOCK) {
    return [
      {
        id: 'ins-1',
        title: 'Error rate anomaly on /error',
        endpoint: '/error',
        changePercent: 240,
        zScore: 2.85,
        severity: 'critical',
        description: 'Error rate on /error increased 240% in the last 15 min.',
        targetUrl: '/incidents/INC-1042',
      },
    ]
  }
  return request<{
    id: string
    title: string
    endpoint: string
    changePercent: number
    zScore: number
    severity: string
    description: string
    targetUrl: string
  }[]>(`/insights?range=${range}`)
}

// ==================== Stack Health & Settings ====================
export async function getStackHealth(): Promise<Service[]> {
  if (USE_MOCK) {
    await wait()
    return services
  }
  return request<Service[]>('/stack-health')
}

export async function testConnection(url: string) {
  if (USE_MOCK) {
    await wait()
    return { ok: true, latency: 42 }
  }
  return request<{ ok: boolean; latency: number; message?: string }>('/connections/test', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function saveSearch(_name: string) {
  await wait()
  return { ok: true }
}

// ==================== Load Test ====================
export async function startLoadTest(config: LoadTestConfig) {
  if (USE_MOCK) {
    await wait()
    context().startTest(config)
    return { ok: true }
  }
  return request<{ ok: boolean; message: string }>('/loadtest/start', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function stopLoadTest() {
  if (USE_MOCK) {
    context().stopTest()
    return { ok: true }
  }
  return request<{ ok: boolean; message: string }>('/loadtest/stop', { method: 'POST' })
}

export async function getLoadTestStatus() {
  if (USE_MOCK) {
    return {
      running: Boolean(context().loadTest),
      progress: context().loadProgress,
      config: context().loadTest,
      requestsSent: 0,
      currentRps: context().loadTest?.rps ?? 0,
      currentLatency: context().loadTest?.latency ?? 0,
      currentErrors: context().loadTest?.errorRate ?? 0,
    }
  }
  return request<{
    running: boolean
    progress: number
    config: LoadTestConfig | null
    requestsSent: number
    currentRps: number
    currentLatency: number
    currentErrors: number
  }>('/loadtest/status')
}

export async function getLoadTestRuns() {
  if (USE_MOCK) {
    return context().pastTests
  }
  return request<any[]>('/loadtest/runs')
}

// ==================== Command Palette Search ====================
export async function searchEverything(q: string) {
  if (USE_MOCK) {
    return []
  }
  return request<{ title: string; path: string; kind: string }[]>(`/search?q=${encodeURIComponent(q)}`)
}

export type { LogEntry }

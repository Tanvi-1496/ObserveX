import type {
  Alert,
  AlertRule,
  ApiKey,
  EndpointMetricSummary,
  GeneralSettings,
  Incident,
  LoadTestConfig,
  LogEntry,
  NotificationSettings,
  RangeKey,
  Service,
  TargetInfo,
  TeamMember,
  Trace,
} from '../types'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

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
  const params = new URLSearchParams({ query, range })
  return request<any[]>(`/timeseries?${params.toString()}`)
}

export async function getKpis(range: RangeKey) {
  return request<{
    requests: number
    latency: number
    p95: number
    errors: number
    uptime: number
    activeAlerts: number
    series: any[]
  }>(`/kpis?range=${range}`)
}

export async function getMetricNames() {
  return request<{ name: string; type: string }[]>('/metrics/names')
}

export async function getEndpointMetrics(range: RangeKey = '15m') {
  return request<EndpointMetricSummary[]>(`/metrics/endpoints?range=${range}`)
}

// ==================== Logs ====================
export async function searchLogs(filters: {
  range: RangeKey
  level?: string
  endpoint?: string
  text?: string
  traceId?: string
  limit?: number
}) {
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
  return request<{ time: string; timestamp: number; info: number; warn: number; error: number }[]>(
    `/logs/volume?range=${range}`
  )
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
export async function searchTraces(filters: {
  range: RangeKey
  endpoint?: string
  status?: string
  min?: number
  max?: number
  limit?: number
}) {
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
  try {
    return await request<Trace>(`/traces/${id}`)
  } catch (err) {
    return undefined
  }
}

// ==================== Alerts & Rules ====================
export async function getAlerts(): Promise<Alert[]> {
  return request<Alert[]>('/alerts')
}

export async function acknowledgeAlert(id: string) {
  return request<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' })
}

export async function silenceAlert(id: string, minutes: number = 60) {
  return request<Alert>(`/alerts/${id}/silence`, {
    method: 'POST',
    body: JSON.stringify({ minutes }),
  })
}

export async function getAlertRules(): Promise<AlertRule[]> {
  return request<AlertRule[]>('/alert-rules')
}

export async function createAlertRule(rule: Omit<AlertRule, 'id'>) {
  return request<AlertRule>('/alert-rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  })
}

export async function updateAlertRule(id: string, patch: Partial<AlertRule>) {
  return request<AlertRule>(`/alert-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function deleteAlertRule(id: string) {
  return request<{ ok: boolean }>(`/alert-rules/${id}`, { method: 'DELETE' })
}

// ==================== Incidents ====================
export async function getIncidents(): Promise<Incident[]> {
  return request<Incident[]>('/incidents')
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  try {
    return await request<Incident>(`/incidents/${id}`)
  } catch (err) {
    return undefined
  }
}

export async function updateIncident(id: string, patch: Partial<Incident>) {
  return request<Incident>(`/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function addIncidentComment(id: string, text: string, author: string = 'Jordan Lee') {
  return request<Incident>(`/incidents/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text, author }),
  })
}

export async function resolveIncident(id: string, summary: string = '') {
  return request<Incident>(`/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  })
}

export async function getIncidentCorrelation(id: string) {
  return request<any>(`/incidents/${id}/correlation`)
}

export async function getIncidentPostmortem(id: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/incidents/${id}/postmortem`)
  return res.text()
}

// ==================== Insights (AIOps) ====================
export async function getInsights(range: RangeKey) {
  return request<
    {
      id: string
      title: string
      endpoint: string
      changePercent: number
      zScore: number
      severity: string
      description: string
      targetUrl: string
    }[]
  >(`/insights?range=${range}`)
}

// ==================== Stack Health ====================
export async function getStackHealth(): Promise<Service[]> {
  return request<Service[]>('/stack-health')
}

export async function getStackTargets(): Promise<TargetInfo[]> {
  return request<TargetInfo[]>('/stack-health/targets')
}

// ==================== Settings ====================
export async function getGeneralSettings(): Promise<GeneralSettings> {
  return request<GeneralSettings>('/settings')
}

export async function updateGeneralSettings(data: GeneralSettings): Promise<GeneralSettings> {
  return request<GeneralSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return request<NotificationSettings>('/settings/notifications')
}

export async function updateNotificationSettings(data: NotificationSettings): Promise<NotificationSettings> {
  return request<NotificationSettings>('/settings/notifications', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function getDataSources(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/settings/datasources')
}

export async function updateDataSources(data: Record<string, string>) {
  return request<{ ok: boolean; datasources: Record<string, string> }>('/settings/datasources', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function testConnection(url: string) {
  return request<{ ok: boolean; latency: number; message?: string }>('/connections/test', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  return request<TeamMember[]>('/settings/team')
}

export async function createTeamMember(data: { name: string; email: string; role: string }): Promise<TeamMember> {
  return request<TeamMember>('/settings/team', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
  return request<TeamMember>(`/settings/team/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteTeamMember(id: string) {
  return request<{ ok: boolean; message: string }>(`/settings/team/${id}`, {
    method: 'DELETE',
  })
}

export async function getApiKeys(): Promise<ApiKey[]> {
  return request<ApiKey[]>('/settings/apikeys')
}

export async function createApiKey(name: string) {
  return request<{ id: string; name: string; apiKey: string; maskedKey: string; createdAt: string }>('/settings/apikeys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function deleteApiKey(id: string) {
  return request<{ ok: boolean; message: string }>(`/settings/apikeys/${id}`, {
    method: 'DELETE',
  })
}

export async function saveSearch(_name: string) {
  return { ok: true }
}

// ==================== Load Test ====================
export async function startLoadTest(config: LoadTestConfig) {
  return request<{ ok: boolean; message: string }>('/loadtest/start', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function stopLoadTest() {
  return request<{ ok: boolean; message: string }>('/loadtest/stop', { method: 'POST' })
}

export async function getLoadTestStatus() {
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
  return request<any[]>('/loadtest/runs')
}

// ==================== Command Palette Search ====================
export async function searchEverything(q: string) {
  return request<{ title: string; path: string; kind: string }[]>(`/search?q=${encodeURIComponent(q)}`)
}

export type { LogEntry }

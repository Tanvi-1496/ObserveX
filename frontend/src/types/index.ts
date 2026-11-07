export type RangeKey = '5m' | '15m' | '1h' | '6h' | '24h' | '7d'
export type Severity = 'critical' | 'warning' | 'info'
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface MetricPoint {
  time: string
  timestamp: number
  requests: number
  errors: number
  latency: number
  p50: number
  p95: number
  p99: number
  cpu: number
  memory: number
}

export interface EndpointMetricSummary {
  method: string
  endpoint: string
  requests: string
  avgLatency: string
  p95Latency: string
  errorRate: string
}

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  endpoint: string
  message: string
  traceId: string
  status: number
  duration: number
}

export interface Span {
  id: string
  parentId?: string
  operation: string
  service: string
  start: number
  duration: number
  status: 'ok' | 'error'
  tags: Record<string, string | number>
}

export interface Trace {
  id: string
  endpoint: string
  operation: string
  startTime: string
  duration: number
  status: 'ok' | 'error'
  spans: Span[]
}

export interface Alert {
  id: string
  name: string
  severity: Severity
  endpoint: string
  value: number
  threshold: number
  unit: string
  since: string
  status: 'firing' | 'acknowledged' | 'silenced'
  incidentId: string
}

export interface AlertRule {
  id: string
  name: string
  query: string
  condition: '>' | '<' | '='
  threshold: number
  duration: string
  severity: Severity
  enabled: boolean
}

export interface TimelineEvent {
  time: string
  title: string
  description: string
  kind: 'alert' | 'metric' | 'log' | 'trace' | 'action'
}

export interface Incident {
  id: string
  title: string
  severity: Severity
  status: 'Open' | 'Investigating' | 'Resolved'
  endpoint: string
  startedAt: string
  resolvedAt?: string
  assignee: string
  timeline: TimelineEvent[]
  comments: { author: string; text: string; time: string }[]
}

export interface Service {
  name: string
  status: 'Up' | 'Down' | 'Degraded'
  version: string
  uptime: string
  lastScrape: string
  ingestion: string
  url: string
  responseTime?: string
  lastCheck?: string
}

export interface TargetInfo {
  endpoint: string
  state: 'Up' | 'Down'
  lastScrape: string
  duration: string
  error: string
}

export interface LoadTestConfig {
  endpoints: string[]
  rps: number
  duration: number
  concurrency: number
  latency: number
  errorRate: number
  cpuSpike: boolean
}

export interface GeneralSettings {
  workspaceName: string
  defaultEnvironment: string
  defaultTimeRange: string
}

export interface NotificationSettings {
  incidentUpdates: boolean
  alertDigests: boolean
  weeklySloReport: boolean
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'Admin' | 'Editor' | 'Viewer'
  status: 'Active' | 'Invited'
  createdAt: string
}

export interface ApiKey {
  id: string
  name: string
  maskedKey: string
  createdAt: string
  lastUsed?: string | null
}

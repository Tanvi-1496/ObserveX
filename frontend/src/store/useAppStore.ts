import { create } from 'zustand'
import type { Alert, AlertRule, Incident, LoadTestConfig, RangeKey } from '../types'
import { initialAlerts, initialIncidents, initialRules } from '../data/mock'

export interface ToastItem { id: number; message: string; tone: 'success' | 'info' | 'error' }
interface State {
  range: RangeKey
  environment: string
  refresh: number
  theme: 'light' | 'dark'
  alerts: Alert[]
  rules: AlertRule[]
  incidents: Incident[]
  loadTest: LoadTestConfig | null
  loadProgress: number
  pastTests: { id: string; config: LoadTestConfig; requests: number; latency: number; errors: number }[]
  toasts: ToastItem[]
  setRange: (range: RangeKey) => void
  setEnvironment: (environment: string) => void
  setRefresh: (refresh: number) => void
  toggleTheme: () => void
  notify: (message: string, tone?: ToastItem['tone']) => void
  dismissToast: (id: number) => void
  updateAlert: (id: string, status: Alert['status']) => void
  addRule: (rule: AlertRule) => void
  toggleRule: (id: string) => void
  deleteRule: (id: string) => void
  updateIncident: (id: string, patch: Partial<Incident>) => void
  addComment: (id: string, text: string) => void
  startTest: (config: LoadTestConfig) => void
  stopTest: () => void
  tickTest: () => void
}

export const useAppStore = create<State>((set, get) => ({
  range: '15m', environment: 'prod', refresh: 10, theme: 'light',
  alerts: initialAlerts, rules: initialRules, incidents: initialIncidents,
  loadTest: null, loadProgress: 0, pastTests: [], toasts: [],
  setRange: range => set({ range }),
  setEnvironment: environment => set({ environment }),
  setRefresh: refresh => set({ refresh }),
  toggleTheme: () => set(s => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  notify: (message, tone = 'success') => {
    const id = Date.now()
    set(s => ({ toasts: [...s.toasts, { id, message, tone }] }))
    window.setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  updateAlert: (id, status) => set(s => ({ alerts: s.alerts.map(a => a.id === id ? { ...a, status } : a) })),
  addRule: rule => set(s => ({ rules: [...s.rules, rule] })),
  toggleRule: id => set(s => ({ rules: s.rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) })),
  deleteRule: id => set(s => ({ rules: s.rules.filter(r => r.id !== id) })),
  updateIncident: (id, patch) => set(s => ({ incidents: s.incidents.map(i => i.id === id ? { ...i, ...patch } : i) })),
  addComment: (id, text) => set(s => ({ incidents: s.incidents.map(i => i.id === id ? { ...i, comments: [...i.comments, { author: 'Jordan Lee', text, time: new Date().toISOString() }] } : i) })),
  startTest: config => set(s => {
    const trigger = config.errorRate > 5 || config.latency > 1000
    const newAlert: Alert = { id: `al-${Date.now()}`, name: 'Load test threshold exceeded', severity: config.errorRate > 15 ? 'critical' : 'warning', endpoint: config.endpoints[0], value: config.errorRate || config.latency, threshold: config.errorRate ? 5 : 1000, unit: config.errorRate ? '%' : 'ms', since: new Date().toISOString(), status: 'firing', incidentId: 'INC-LIVE' }
    const newIncident: Incident = { id: 'INC-LIVE', title: 'Load test degradation detected', severity: newAlert.severity, status: 'Open', endpoint: config.endpoints[0], startedAt: new Date().toISOString(), assignee: 'Unassigned', timeline: timelineForLoad(), comments: [] }
    return { loadTest: config, loadProgress: 0, alerts: trigger ? [newAlert, ...s.alerts] : s.alerts, incidents: trigger ? [newIncident, ...s.incidents.filter(i => i.id !== 'INC-LIVE')] : s.incidents }
  }),
  stopTest: () => set(s => {
    if (!s.loadTest) return {}
    return { pastTests: [{ id: `LT-${s.pastTests.length + 101}`, config: s.loadTest, requests: Math.round(s.loadTest.rps * s.loadTest.duration * Math.max(.1, s.loadProgress / 100)), latency: 180 + s.loadTest.latency, errors: s.loadTest.errorRate }, ...s.pastTests], loadTest: null, loadProgress: 0 }
  }),
  tickTest: () => set(s => ({ loadProgress: Math.min(100, s.loadProgress + (100 / Math.max(1, s.loadTest?.duration ?? 1))) })),
}))

const timelineForLoad = () => [
  { time: new Date().toLocaleTimeString(), title: 'Alert fired', description: 'Load test crossed configured SLO', kind: 'alert' as const },
  { time: new Date().toLocaleTimeString(), title: 'Synthetic traffic identified', description: 'Load Test Lab is the likely source', kind: 'metric' as const },
]

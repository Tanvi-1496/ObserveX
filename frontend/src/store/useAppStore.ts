import { create } from 'zustand'
import type { Alert, AlertRule, Incident, LoadTestConfig, RangeKey } from '../types'

export interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'info' | 'error'
}

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
  setAlerts: (alerts: Alert[]) => void
  setRules: (rules: AlertRule[]) => void
  setIncidents: (incidents: Incident[]) => void
  updateAlert: (id: string, status: Alert['status']) => void
  addRule: (rule: AlertRule) => void
  toggleRule: (id: string) => void
  deleteRule: (id: string) => void
  updateIncident: (id: string, patch: Partial<Incident>) => void
  addComment: (id: string, text: string) => void
  startTest: (config: LoadTestConfig) => void
  stopTest: () => void
  tickTest: (progress?: number) => void
}

export const useAppStore = create<State>((set, get) => ({
  range: '15m',
  environment: 'prod',
  refresh: 10,
  theme: 'light',
  alerts: [],
  rules: [],
  incidents: [],
  loadTest: null,
  loadProgress: 0,
  pastTests: [],
  toasts: [],
  setRange: range => set({ range }),
  setEnvironment: environment => set({ environment }),
  setRefresh: refresh => set({ refresh }),
  toggleTheme: () =>
    set(s => {
      const nextTheme = s.theme === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = nextTheme
      return { theme: nextTheme }
    }),
  notify: (message, tone = 'success') => {
    const id = Date.now()
    set(s => ({ toasts: [...s.toasts, { id, message, tone }] }))
    window.setTimeout(() => get().dismissToast(id), 3500)
  },
  dismissToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  setAlerts: alerts => set({ alerts }),
  setRules: rules => set({ rules }),
  setIncidents: incidents => set({ incidents }),
  updateAlert: (id, status) => set(s => ({ alerts: s.alerts.map(a => (a.id === id ? { ...a, status } : a)) })),
  addRule: rule => set(s => ({ rules: [...s.rules.filter(r => r.id !== rule.id), rule] })),
  toggleRule: id => set(s => ({ rules: s.rules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)) })),
  deleteRule: id => set(s => ({ rules: s.rules.filter(r => r.id !== id) })),
  updateIncident: (id, patch) =>
    set(s => ({ incidents: s.incidents.map(i => (i.id === id ? { ...i, ...patch } : i)) })),
  addComment: (id, text) =>
    set(s => ({
      incidents: s.incidents.map(i =>
        i.id === id
          ? {
              ...i,
              comments: [
                ...i.comments,
                { author: 'Jordan Lee', text, time: new Date().toISOString() },
              ],
            }
          : i
      ),
    })),
  startTest: config => set({ loadTest: config, loadProgress: 0 }),
  stopTest: () => set({ loadTest: null, loadProgress: 0 }),
  tickTest: progress =>
    set(s => ({
      loadProgress:
        progress !== undefined
          ? progress
          : Math.min(100, s.loadProgress + 100 / Math.max(1, s.loadTest?.duration ?? 1)),
    })),
}))

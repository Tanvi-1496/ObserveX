import { createBrowserRouter } from 'react-router'
import type { ComponentType } from 'react'
import { Layout } from './components/Layout'

const page = (loader: () => Promise<{ default: ComponentType }>) => async () => {
  const module = await loader()
  return { Component: module.default }
}

export const router = createBrowserRouter([{
  path: '/', Component: Layout, children: [
    { index: true, lazy: page(() => import('./pages/Overview')) },
    { path: 'metrics', lazy: page(() => import('./pages/Metrics')) },
    { path: 'logs', lazy: page(() => import('./pages/Logs')) },
    { path: 'traces', lazy: page(() => import('./pages/Traces')) },
    { path: 'traces/:id', lazy: page(() => import('./pages/TraceDetail')) },
    { path: 'alerts', lazy: page(() => import('./pages/Alerts')) },
    { path: 'incidents', lazy: page(() => import('./pages/Incidents')) },
    { path: 'incidents/:id', lazy: page(() => import('./pages/IncidentDetail')) },
    { path: 'loadtest', lazy: page(() => import('./pages/LoadTest')) },
    { path: 'health', lazy: page(() => import('./pages/StackHealth')) },
    { path: 'settings', lazy: page(() => import('./pages/Settings')) },
    { path: '*', lazy: page(() => import('./pages/Overview')) },
  ],
}])

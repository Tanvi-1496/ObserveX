import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Activity, Bell, ChartNoAxesCombined, ChevronsLeft, CircleGauge, Command, FlaskConical, HeartPulse, Menu, Moon, Search, Settings, ShieldAlert, Siren, Sun, TerminalSquare, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { searchEverything } from '../lib/api'
import { Button, IconButton, Input, Modal, Select } from './ui'

const nav = [
  { to: '/', label: 'Overview', icon: CircleGauge },
  { to: '/metrics', label: 'Metrics', icon: ChartNoAxesCombined },
  { to: '/logs', label: 'Logs', icon: TerminalSquare },
  { to: '/traces', label: 'Traces', icon: Activity },
  { to: '/alerts', label: 'Alerts', icon: ShieldAlert },
  { to: '/incidents', label: 'Incidents', icon: Siren },
  { to: '/loadtest', label: 'Load Test Lab', icon: FlaskConical },
  { to: '/health', label: 'Stack Health', icon: HeartPulse },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [palette, setPalette] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [query, setQuery] = useState('')
  const [extraResults, setExtraResults] = useState<{ title: string; path: string; kind: string }[]>([])
  const [notifications, setNotifications] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const state = useAppStore()
  const title = nav.find(n => n.to === location.pathname)?.label ?? (location.pathname.includes('INC-') ? 'Incident detail' : location.pathname.startsWith('/traces/') ? 'Trace detail' : 'ObserveX')
  useEffect(() => { document.documentElement.dataset.theme = state.theme }, [state.theme])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) setShortcuts(true)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setExtraResults([])
      return
    }
    const timer = setTimeout(() => {
      searchEverything(query).then(setExtraResults).catch(() => {})
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const results = useMemo(() => nav.filter(n => n.label.toLowerCase().includes(query.toLowerCase())), [query])
  return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={19} /></div><strong>ObserveX</strong><IconButton label="Close menu" className="mobile-close" onClick={() => setMobile(false)}><X size={18}/></IconButton></div>
      <nav>{nav.map(item => <NavLink to={item.to} end={item.to === '/'} key={item.to} onClick={() => setMobile(false)}><item.icon size={18}/><span>{item.label}</span>{item.label === 'Alerts' && <b>{state.alerts.filter(a => a.status === 'firing').length}</b>}</NavLink>)}</nav>
      <Button variant="ghost" className="collapse-button" onClick={() => setCollapsed(v => !v)}><ChevronsLeft size={17}/><span>Collapse</span></Button>
      <div className="service-pill"><span/><div><strong>demo-flask-app</strong><small>v1.4.2 · prod</small></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-title"><IconButton label="Open menu" className="menu-button" onClick={() => setMobile(true)}><Menu size={20}/></IconButton><div><small>ObserveX /</small><strong>{title}</strong></div></div>
        <div className="top-actions">
          <Button variant="secondary" className="search-trigger" onClick={() => setPalette(true)}><Search size={16}/><span>Search anything</span><kbd>⌘ K</kbd></Button>
          <Select aria-label="Environment" value={state.environment} onChange={e => state.setEnvironment(e.target.value)}><option>dev</option><option>staging</option><option>prod</option></Select>
          <Select aria-label="Time range" value={state.range} onChange={e => state.setRange(e.target.value as typeof state.range)}>{['5m','15m','1h','6h','24h','7d'].map(r => <option key={r} value={r}>Last {r}</option>)}</Select>
          <Select aria-label="Auto refresh" value={state.refresh} onChange={e => state.setRefresh(+e.target.value)}><option value="0">Refresh off</option><option value="5">Live · 5s</option><option value="10">Live · 10s</option><option value="30">Live · 30s</option></Select>
          {state.refresh > 0 && <span className="live-dot" title="Live data"/>}
          <div className="relative"><IconButton label="Notifications" onClick={() => setNotifications(v => !v)}><Bell size={18}/><i>{state.alerts.length}</i></IconButton>{notifications && <div className="popover notifications"><strong>Notifications</strong><p>High error rate on /error</p><p>p95 latency elevated on /slow</p><Button variant="ghost" onClick={() => { navigate('/alerts'); setNotifications(false) }}>View all alerts</Button></div>}</div>
          <IconButton label="Toggle theme" onClick={state.toggleTheme}>{state.theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</IconButton>
          <button className="avatar" aria-label="Open user menu">JL</button>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
    <Modal open={palette} title="Command palette" onClose={() => setPalette(false)}><div className="command-input"><Command size={18}/><Input autoFocus placeholder="Search pages, endpoints, trace IDs…" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="command-results">{results.map(item => <Button variant="ghost" key={item.to} onClick={() => { navigate(item.to); setPalette(false); setQuery('') }}><item.icon size={17}/>{item.label}<span>Jump to page</span></Button>)}{['/error','/orders','/slow'].filter(e => e.includes(query) && query).map(endpoint => <Button variant="ghost" key={endpoint} onClick={() => { navigate(`/logs?endpoint=${encodeURIComponent(endpoint)}`); setPalette(false) }}><TerminalSquare size={17}/>Logs for {endpoint}<span>Endpoint</span></Button>)}{extraResults.map(res => <Button variant="ghost" key={res.path} onClick={() => { navigate(res.path); setPalette(false); setQuery('') }}>{res.kind === 'incident' ? <Siren size={17}/> : res.kind === 'trace' ? <Activity size={17}/> : <TerminalSquare size={17}/>}{res.title}<span>{res.kind}</span></Button>)}</div></Modal>
    <Modal open={shortcuts} title="Keyboard shortcuts" onClose={() => setShortcuts(false)}><div className="shortcut-list"><p><kbd>⌘ K</kbd> Open command palette</p><p><kbd>?</kbd> Show shortcuts</p><p><kbd>Esc</kbd> Close dialog</p></div></Modal>
    <div className="toasts">{state.toasts.map(t => <div className={`toast ${t.tone}`} key={t.id}><span>{t.message}</span><IconButton label="Dismiss" onClick={() => state.dismissToast(t.id)}><X size={15}/></IconButton></div>)}</div>
  </div>
}

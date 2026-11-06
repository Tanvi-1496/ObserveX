import { useEffect, useMemo, useState } from 'react'
import { Clipboard, Download, Pause, Play, Save, Search, WrapText } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { searchLogs, saveSearch, subscribeLogTail } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { Badge, Button, Card, DataTable, Drawer, EmptyState, Input, PageTitle, Select, Skeleton } from '../components/ui'

export default function Logs() {
  const range = useAppStore(s => s.range)
  const notify = useAppStore(s => s.notify)
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof searchLogs>>[number]>()
  const [page, setPage] = useState(0)
  const [tail, setTail] = useState(false)
  const [wrap, setWrap] = useState(false)
  const navigate = useNavigate()
  const filters = { range, level: params.get('level') ?? '', endpoint: params.get('endpoint') ?? '', text: params.get('q') ?? '', traceId: params.get('traceId') ?? '' }
  const logs = useAsync(() => searchLogs(filters), [range, filters.level, filters.endpoint, filters.text, filters.traceId])

  // Live tail SSE subscription
  useEffect(() => {
    if (!tail) return
    const unsubscribe = subscribeLogTail((entry) => {
      logs.setData(prev => {
        if (!prev) return [entry]
        if (prev.some(l => l.id === entry.id)) return prev
        return [entry, ...prev]
      })
    }, { level: filters.level, endpoint: filters.endpoint, text: filters.text })
    return () => unsubscribe()
  }, [tail, filters.level, filters.endpoint, filters.text])

  const visible = useMemo(() => logs.data?.slice(page * 50, page * 50 + 50) ?? [], [logs.data, page])
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); setPage(0) }
  const download = () => { const blob = new Blob([(logs.data ?? []).map(l => JSON.stringify(l)).join('\n')], { type: 'application/x-ndjson' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'observex-logs.ndjson'; a.click(); URL.revokeObjectURL(a.href) }
  const histogram = (logs.data ?? []).slice(0, 80).reduce((acc, log, i) => { const bucket = Math.floor(i / 8); acc[bucket] ??= { info: 0, warn: 0, error: 0 }; acc[bucket][log.level === 'ERROR' ? 'error' : log.level === 'WARN' ? 'warn' : 'info']++; return acc }, [] as {info:number;warn:number;error:number}[])
  return <div className="page">
    <PageTitle title="Logs Explorer" description={`${logs.data?.length ?? '—'} log entries from Loki · demo-flask-app`} actions={<><Button variant={tail ? 'danger' : 'secondary'} onClick={() => setTail(v => !v)}>{tail ? <Pause size={15}/> : <Play size={15}/>} {tail ? 'Pause live tail' : 'Live tail'}</Button><Button variant="secondary" onClick={() => setWrap(v => !v)}><WrapText size={15}/> {wrap ? 'No wrap' : 'Wrap lines'}</Button><Button variant="secondary" onClick={download}><Download size={15}/> Download</Button></>}/>
    <Card className="log-filters"><div className="search-field grow"><Search size={16}/><Input placeholder="Search log messages…" value={filters.text} onChange={e => update('q', e.target.value)}/></div><Select aria-label="Log level" value={filters.level} onChange={e => update('level', e.target.value)}><option value="">All levels</option><option>DEBUG</option><option>INFO</option><option>WARN</option><option>ERROR</option></Select><Select aria-label="Endpoint" value={filters.endpoint} onChange={e => update('endpoint', e.target.value)}><option value="">All endpoints</option>{['/','/orders','/slow','/error'].map(e => <option key={e}>{e}</option>)}</Select><Input placeholder="Trace ID" value={filters.traceId} onChange={e => update('traceId', e.target.value)}/><Button variant="secondary" onClick={() => saveSearch('My search').then(() => notify('Log search saved'))}><Save size={15}/> Save</Button></Card>
    <Card><div className="volume-chart" aria-label="Log volume histogram">{histogram.map((b, i) => <Button variant="ghost" key={i} title={`${b.info+b.warn+b.error} logs`} onClick={() => notify('Time range narrowed to selected bucket', 'info')}><span className="bar error" style={{ height: `${b.error * 5}px` }}/><span className="bar warn" style={{ height: `${b.warn * 5}px` }}/><span className="bar info" style={{ height: `${b.info * 5}px` }}/></Button>)}</div><div className="volume-legend"><span><i className="dot info"/> Info</span><span><i className="dot warn"/> Warn</span><span><i className="dot error"/> Error</span></div></Card>
    <Card className={wrap ? 'wrap-table' : ''}>{logs.loading ? <Skeleton rows={10}/> : visible.length ? <DataTable columns={['Timestamp','Level','Endpoint','Message','Trace ID','Duration']} rows={visible.map(log => [<code>{new Date(log.timestamp).toLocaleTimeString()}</code>, <Badge tone={log.level === 'ERROR' ? 'error' : log.level === 'WARN' ? 'warning' : log.level === 'INFO' ? 'info' : 'neutral'}>{log.level}</Badge>, <code>{log.endpoint}</code>, <span className="log-message">{log.message}</span>, <code className="trace-chip">{log.traceId}</code>, `${log.duration} ms`])} onRowClick={i => setSelected(visible[i])}/> : <EmptyState title="No logs match these filters" detail="Clear a filter or widen the selected time range." action={<Button onClick={() => setParams({})}>Clear filters</Button>}/>}<div className="pagination"><span>Page {page + 1} of {Math.max(1, Math.ceil((logs.data?.length ?? 0) / 50))}</span><div><Button variant="secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="secondary" disabled={(page + 1) * 50 >= (logs.data?.length ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button></div></div></Card>
    <Drawer open={Boolean(selected)} title="Log detail" onClose={() => setSelected(undefined)}>{selected && <div className="drawer-content"><div className="drawer-actions"><Badge tone={selected.level === 'ERROR' ? 'error' : 'info'}>{selected.level}</Badge><Button variant="secondary" onClick={() => { navigator.clipboard.writeText(JSON.stringify(selected, null, 2)); notify('Log copied') }}><Clipboard size={15}/> Copy JSON</Button></div><pre>{JSON.stringify({ ...selected, service: 'demo-flask-app', environment: 'prod', host: 'flask-7d8f4c8-2k9pz' }, null, 2)}</pre><Button className="w-full" onClick={() => navigate(`/traces/${selected.traceId}`)}>View trace</Button><Button variant="secondary" className="w-full" onClick={() => navigate(`/metrics?at=${encodeURIComponent(selected.timestamp)}`)}>View metrics at this time</Button></div>}</Drawer>
  </div>
}

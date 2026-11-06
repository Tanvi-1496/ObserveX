import { useState } from 'react'
import { ArrowLeft, ChevronRight, Copy, Database, Server } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { getTrace, searchLogs } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { Badge, Button, Card, DataTable, Drawer, EmptyState, Loading, PageTitle, Tabs } from '../components/ui'
import type { Span } from '../types'

export default function TraceDetail() {
  const { id = '' } = useParams()
  const range = useAppStore(s => s.range)
  const notify = useAppStore(s => s.notify)
  const navigate = useNavigate()
  const [tab, setTab] = useState('Waterfall')
  const [span, setSpan] = useState<Span>()
  const trace = useAsync(() => getTrace(id), [id])
  const logs = useAsync(() => searchLogs({ range, traceId: id }), [id, range])
  if (trace.loading) return <div className="page"><Loading/></div>
  if (!trace.data) return <div className="page"><EmptyState title="Trace not found" detail="This trace may be outside the generated time window." action={<Button onClick={() => navigate('/traces')}>Back to traces</Button>}/></div>
  return <div className="page">
    <Button variant="ghost" className="back-button" onClick={() => navigate('/traces')}><ArrowLeft size={16}/> All traces</Button>
    <PageTitle title={trace.data.operation} description={`Started ${new Date(trace.data.startTime).toLocaleString()}`} actions={<Button variant="secondary" onClick={() => { navigator.clipboard.writeText(id); notify('Trace ID copied') }}><Copy size={15}/> <code>{id}</code></Button>}/>
    <div className="trace-summary"><Card><span>Duration</span><strong>{trace.data.duration} ms</strong></Card><Card><span>Spans</span><strong>{trace.data.spans.length}</strong></Card><Card><span>Status</span><Badge tone={trace.data.status === 'error' ? 'error' : 'success'}>{trace.data.status}</Badge></Card><Card><span>Service</span><strong>demo-flask-app</strong></Card></div>
    <Tabs tabs={['Waterfall','Related logs','JSON']} active={tab} onChange={setTab}/>
    {tab === 'Waterfall' && <Card><div className="waterfall-head"><span>Service & operation</span><span>0 ms</span><span>{trace.data.duration} ms</span></div><div className="waterfall">{trace.data.spans.map((s, i) => <Button variant="ghost" key={s.id} className={`span-row depth-${i ? i === 1 ? 1 : 2 : 0}`} onClick={() => setSpan(s)}><div className="span-name">{s.service === 'postgres' ? <Database size={15}/> : <Server size={15}/>}<span><strong>{s.operation}</strong><small>{s.service}</small></span></div><div className="span-track"><span className={s.status} style={{ left: `${s.start / trace.data!.duration * 100}%`, width: `${Math.max(3, s.duration / trace.data!.duration * 100)}%` }}/></div><code>{s.duration} ms</code><ChevronRight size={15}/></Button>)}</div></Card>}
    {tab === 'Related logs' && <Card><DataTable columns={['Time','Level','Endpoint','Message']} rows={(logs.data ?? []).map(l => [new Date(l.timestamp).toLocaleTimeString(), <Badge tone={l.level === 'ERROR' ? 'error' : 'info'}>{l.level}</Badge>, <code>{l.endpoint}</code>, l.message])} onRowClick={() => navigate(`/logs?traceId=${id}`)}/></Card>}
    {tab === 'JSON' && <Card><pre>{JSON.stringify(trace.data, null, 2)}</pre></Card>}
    <Drawer open={Boolean(span)} title="Span detail" onClose={() => setSpan(undefined)}>{span && <div className="drawer-content"><div className="drawer-actions"><Badge tone={span.status === 'error' ? 'error' : 'success'}>{span.status}</Badge><strong>{span.duration} ms</strong></div><pre>{JSON.stringify({ operation: span.operation, service: span.service, tags: span.tags, events: span.status === 'error' ? [{ name: 'exception', message: 'Simulated database timeout' }] : [], process: { hostname: 'flask-7d8f4c8-2k9pz', version: '1.4.2' } }, null, 2)}</pre></div>}</Drawer>
  </div>
}

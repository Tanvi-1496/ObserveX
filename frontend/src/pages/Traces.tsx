import { useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useNavigate } from 'react-router'
import { searchTraces } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { TraceScatter } from '../components/charts'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Skeleton } from '../components/ui'

export default function Traces() {
  const range = useAppStore(s => s.range)
  const navigate = useNavigate()
  const [endpoint, setEndpoint] = useState('')
  const [status, setStatus] = useState('all')
  const [min, setMin] = useState(0)
  const [max, setMax] = useState(4000)
  const [limit, setLimit] = useState(100)
  const traces = useAsync(() => searchTraces({ range, endpoint, status, min, max, limit }), [range, endpoint, status, min, max, limit])
  return <div className="page">
    <PageTitle title="Traces" description="Distributed request traces from Jaeger"/>
    <Card className="trace-filters"><div className="search-field grow"><Search size={15}/><Input placeholder="Endpoint or operation…" value={endpoint} onChange={e => setEndpoint(e.target.value)}/></div><Select aria-label="Trace status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All status</option><option value="ok">OK</option><option value="error">Error</option></Select><label>Min <Input type="number" value={min} onChange={e => setMin(+e.target.value)}/></label><label>Max <Input type="number" value={max} onChange={e => setMax(+e.target.value)}/></label><Select aria-label="Result limit" value={limit} onChange={e => setLimit(+e.target.value)}><option value="50">50 traces</option><option value="100">100 traces</option><option value="200">200 traces</option></Select></Card>
    <Card><div className="section-title"><h2>Duration by time</h2><span><i className="dot info"/> OK &nbsp; <i className="dot error"/> Error</span></div>{traces.loading ? <Skeleton rows={5}/> : <TraceScatter traces={traces.data ?? []} onSelect={t => navigate(`/traces/${t.id}`)}/>}</Card>
    <Card><div className="section-title"><h2>Trace results</h2><Badge tone="neutral">{traces.data?.length ?? 0} traces</Badge></div>{traces.loading ? <Skeleton rows={8}/> : traces.data?.length ? <div className="trace-list">{traces.data.map(trace => <Button variant="ghost" key={trace.id} onClick={() => navigate(`/traces/${trace.id}`)}><div className="trace-status"><span className={trace.status}/><code>{trace.id}</code></div><div><strong>{trace.operation}</strong><small>{new Date(trace.startTime).toLocaleString()} · {trace.spans.length} spans</small></div><div className="duration-visual"><span style={{ width: `${Math.min(100, trace.duration / 30)}%` }}/><strong>{trace.duration.toLocaleString()} ms</strong></div>{trace.status === 'error' && <Badge tone="error">Error</Badge>}<ArrowRight size={16}/></Button>)}</div> : <EmptyState title="No traces found" detail="Try relaxing the duration or status filters."/>}</Card>
  </div>
}

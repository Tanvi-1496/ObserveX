import { useState } from 'react'
import { BellPlus, Bookmark, Download, Play, Search } from 'lucide-react'
import { getTimeseries } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, Input, Label, Modal, PageTitle, Select, Skeleton } from '../components/ui'

const templates: Record<string, string> = {
  'Request rate': 'sum(rate(http_requests_total[5m]))',
  'Error rate': 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100',
  'p95 latency': 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
  'CPU usage': 'rate(process_cpu_seconds_total[5m]) * 100',
  'Memory usage': 'process_resident_memory_bytes',
  'Container restarts': 'increase(kube_pod_container_status_restarts_total[10m])',
}
const metricNames = ['http_requests_total', 'http_request_duration_seconds', 'process_cpu_seconds_total', 'process_resident_memory_bytes', 'container_restarts_total', 'python_gc_objects_collected_total']

export default function Metrics() {
  const range = useAppStore(s => s.range)
  const notify = useAppStore(s => s.notify)
  const addRule = useAppStore(s => s.addRule)
  const [query, setQuery] = useState(templates['Request rate'])
  const [executed, setExecuted] = useState(query)
  const [kind, setKind] = useState<'line'|'area'|'bar'>('area')
  const [compare, setCompare] = useState(false)
  const [metricSearch, setMetricSearch] = useState('')
  const [ruleOpen, setRuleOpen] = useState(false)
  const data = useAsync(() => getTimeseries(executed, range), [executed, range])
  const exportCsv = () => {
    if (!data.data) return
    const csv = ['time,requests,errors,latency', ...data.data.map(p => `${p.time},${p.requests},${p.errors},${p.latency}`)].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'observex-metrics.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  return <div className="page">
    <PageTitle title="Metrics Explorer" description="Query Prometheus-compatible time series" actions={<><Button variant="secondary" onClick={() => { notify('Query saved to your workspace'); }}><Bookmark size={15}/> Save query</Button><Button variant="secondary" onClick={() => setRuleOpen(true)}><BellPlus size={15}/> Create alert</Button><Button variant="secondary" onClick={exportCsv}><Download size={15}/> Export CSV</Button></>}/>
    <div className="metrics-layout">
      <div className="space-y-4">
        <Card className="query-card"><div className="query-row"><Select aria-label="Query templates" defaultValue="" onChange={e => { if(e.target.value) { setQuery(templates[e.target.value]); setExecuted(templates[e.target.value]) } }}><option value="">Query templates</option>{Object.keys(templates).map(t => <option key={t}>{t}</option>)}</Select><Input className="query-input mono" value={query} onChange={e => setQuery(e.target.value)} aria-label="PromQL query"/><Button onClick={() => setExecuted(query)}><Play size={15}/> Run</Button></div></Card>
        <Card><div className="chart-toolbar"><div className="segmented">{(['line','area','bar'] as const).map(k => <Button variant="ghost" className={kind === k ? 'active' : ''} key={k} onClick={() => setKind(k)}>{k[0].toUpperCase()+k.slice(1)}</Button>)}</div><Label className="switch-label"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/><span/> Compare with 1 hour ago</Label></div>{data.loading ? <Skeleton rows={6}/> : <MetricsChart data={data.data ?? []} kind={kind} keys={[executed.includes('error') ? 'errors' : executed.includes('duration') ? 'p95' : executed.includes('cpu') ? 'cpu' : executed.includes('memory') ? 'memory' : 'requests']} compare={compare} height={390}/>}</Card>
        <div className="query-stats"><Card><span>Resolution</span><strong>30s</strong></Card><Card><span>Series</span><strong>4</strong></Card><Card><span>Samples</span><strong>{data.data?.length ?? 0}</strong></Card><Card><span>Query time</span><strong>42 ms</strong></Card></div>
      </div>
      <Card className="metric-browser"><strong>Metric browser</strong><div className="search-field"><Search size={15}/><Input placeholder="Search metrics…" value={metricSearch} onChange={e => setMetricSearch(e.target.value)}/></div><div>{metricNames.filter(m => m.includes(metricSearch)).map((name, i) => <Button variant="ghost" key={name} onClick={() => setQuery(q => `${q} ${name}`)}><code>{name}</code><Badge tone="neutral">{i % 3 === 0 ? 'counter' : i % 3 === 1 ? 'histogram' : 'gauge'}</Badge></Button>)}</div></Card>
    </div>
    <Modal open={ruleOpen} title="Create alert from query" onClose={() => setRuleOpen(false)}><div className="form-grid"><Label>Rule name<Input defaultValue="New metric alert" id="ruleName"/></Label><Label>Query<Input value={query} readOnly className="mono"/></Label><div className="field-row"><Label>Condition<Select defaultValue=">"><option>&gt;</option><option>&lt;</option><option>=</option></Select></Label><Label>Threshold<Input type="number" defaultValue="5"/></Label><Label>For<Select defaultValue="5m"><option>1m</option><option>5m</option><option>10m</option></Select></Label></div><Card><MetricsChart data={data.data ?? []} keys={['errors']} height={150}/></Card><div className="modal-actions"><Button variant="secondary" onClick={() => setRuleOpen(false)}>Cancel</Button><Button onClick={() => { addRule({ id: `rule-${Date.now()}`, name: 'New metric alert', query, condition: '>', threshold: 5, duration: '5m', severity: 'warning', enabled: true }); notify('Alert rule created'); setRuleOpen(false) }}>Create rule</Button></div></div></Modal>
  </div>
}

import { ArrowDownRight, ArrowUpRight, ExternalLink, HeartPulse, Lightbulb, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { getAlerts, getInsights, getKpis, searchLogs } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart, Sparkline } from '../components/charts'
import { Badge, Button, Card, DataTable, Loading, PageTitle, SectionTitle, Skeleton } from '../components/ui'

const endpointRows = [
  ['GET', '/slow', '8.3k', '1,842 ms', '2,640 ms', '3.1%'],
  ['GET', '/orders', '31.2k', '224 ms', '318 ms', '1.8%'],
  ['GET', '/error', '12.6k', '192 ms', '346 ms', '18.0%'],
  ['GET', '/', '58.4k', '34 ms', '48 ms', '0.2%'],
]

export default function Overview() {
  const range = useAppStore(s => s.range)
  const storeAlerts = useAppStore(s => s.alerts)
  const navigate = useNavigate()
  const kpis = useAsync(() => getKpis(range), [range])
  const logs = useAsync(() => searchLogs({ range, level: 'ERROR' }), [range])
  const liveAlerts = useAsync(getAlerts, [storeAlerts])
  const insights = useAsync(() => getInsights(range), [range])

  const score = kpis.data ? Math.max(0, Math.round(100 - kpis.data.errors * 1.4 - Math.max(0, kpis.data.p95 - 350) / 35)) : 0
  const cards = kpis.data ? [
    ['Requests/sec', kpis.data.requests.toLocaleString(), 8.2, true],
    ['Avg latency', `${kpis.data.latency} ms`, 3.8, false],
    ['p95 latency', `${kpis.data.p95} ms`, 12.4, false],
    ['Error rate', `${kpis.data.errors}%`, 24.1, false],
    ['Uptime', `${kpis.data.uptime}%`, .02, true],
    ['Active alerts', String(kpis.data.activeAlerts), 1, false],
  ] as const : []

  const activeAlertList = (liveAlerts.data ?? storeAlerts).filter(a => a.status === 'firing')
  const topInsight = insights.data?.[0]

  return <div className="page">
    <PageTitle title="Overview" description="Unified service health for demo-flask-app · prod" actions={<Button variant="secondary" onClick={() => navigate('/health')}><HeartPulse size={16}/> Stack health</Button>} />
    <Card className={`health-banner ${score > 92 ? 'healthy' : 'degraded'}`}>
      <div className="health-copy"><div className="health-icon"><ShieldCheck size={24}/></div><div><strong>{score > 92 ? 'All systems operational' : '2 endpoints degraded'}</strong><p>{score > 92 ? 'All signals are within SLO.' : 'Elevated errors on /error and latency on /slow require attention.'}</p></div></div>
      <div className="score-ring" style={{ '--score': score } as React.CSSProperties}><span><strong>{score}</strong><small>Health score</small></span></div>
    </Card>
    {kpis.loading ? <div className="kpi-grid">{Array.from({ length: 6 }, (_, i) => <Card key={i}><Skeleton rows={2}/></Card>)}</div> : <div className="kpi-grid">{cards.map(([label, value, change, good], i) => <Card className="kpi" key={label}><div className="kpi-head"><span>{label}</span><Badge tone={good ? 'success' : i === 4 ? 'success' : 'warning'}>{good ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>} {change}%</Badge></div><div className="kpi-value">{value}</div><div className="kpi-foot"><span>vs previous period</span><Sparkline data={kpis.data!.series.slice(-14).map(p => i === 0 ? p.requests : i < 3 ? p.latency : p.errors)} color={good ? '#10b981' : '#6366f1'}/></div></Card>)}</div>}
    <div className="grid-main">
      <Card><SectionTitle action={<Button variant="ghost" onClick={() => navigate('/metrics')}>Open explorer <ExternalLink size={14}/></Button>}>Request rate vs error rate</SectionTitle>{kpis.data ? <MetricsChart data={kpis.data.series} /> : <Loading/>}</Card>
      <Card><SectionTitle>Latency percentiles</SectionTitle>{kpis.data ? <MetricsChart data={kpis.data.series} kind="line" keys={['p50','p95','p99']} /> : <Loading/>}</Card>
    </div>
    <div className="grid-main">
      <Card><SectionTitle>Top slow endpoints</SectionTitle><DataTable columns={['Method','Endpoint','Requests','Avg','p95','Errors']} rows={endpointRows.map(r => r.map((v, i) => i === 1 ? <code>{v}</code> : i === 5 ? <Badge tone={+v.replace('%','') > 5 ? 'error' : 'neutral'}>{v}</Badge> : v))} onRowClick={i => navigate(`/logs?endpoint=${encodeURIComponent(endpointRows[i][1])}`)}/></Card>
      <Card><SectionTitle action={<Button variant="ghost" onClick={() => navigate('/logs?level=ERROR')}>View all</Button>}>Recent errors</SectionTitle>{logs.loading ? <Skeleton rows={6}/> : <div className="error-feed">{logs.data?.slice(0, 7).map(log => <Button variant="ghost" key={log.id} onClick={() => navigate(`/logs?traceId=${log.traceId}`)}><span className="error-dot"/><div><strong>{log.message}</strong><small><code>{log.endpoint}</code> · {new Date(log.timestamp).toLocaleTimeString()}</small></div><code>{log.traceId.slice(0,8)}</code></Button>)}</div>}</Card>
    </div>
    <div className="grid-thirds">
      <Card className="span-2"><SectionTitle action={<Button variant="ghost" onClick={() => navigate('/alerts')}>View all</Button>}>Active alerts</SectionTitle><div className="alert-list">{activeAlertList.map(alert => <div key={alert.id}><Badge tone={alert.severity}>{alert.severity}</Badge><div><strong>{alert.name}</strong><small>{alert.value}{alert.unit} · threshold {alert.threshold}{alert.unit}</small></div><Button variant="secondary" onClick={() => navigate(`/incidents/${alert.incidentId || 'INC-1042'}`)}>Investigate</Button></div>)}</div></Card>
      <Card className="insight-card">
        <SectionTitle><span className="flex items-center gap-2"><Lightbulb size={17}/> Insights</span></SectionTitle>
        <p>{topInsight?.description ?? 'Error rate on /error increased 240% in the last 15 minutes.'}</p>
        <p>Most failures correlate with <strong>database timeout</strong> traces.</p>
        <Button variant="ghost" onClick={() => navigate(topInsight?.targetUrl ?? '/incidents/INC-1042')}>Investigate insight →</Button>
      </Card>
    </div>
  </div>
}

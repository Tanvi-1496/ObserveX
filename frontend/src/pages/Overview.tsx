import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Cpu,
  ExternalLink,
  HeartPulse,
  Lightbulb,
  Radio,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { getAlerts, getEndpointMetrics, getInsights, getKpis, searchLogs, searchTraces } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart, Sparkline } from '../components/charts'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Loading,
  PageTitle,
  SectionTitle,
  Skeleton,
} from '../components/ui'

export default function Overview() {
  const range = useAppStore(s => s.range)
  const refresh = useAppStore(s => s.refresh)
  const store = useAppStore()
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)

  // Auto-refresh interval
  useEffect(() => {
    if (!refresh) return
    const id = setInterval(() => setTick(t => t + 1), refresh * 1000)
    return () => clearInterval(id)
  }, [refresh])

  const kpis = useAsync(() => getKpis(range), [range, tick])
  const logs = useAsync(() => searchLogs({ range, level: 'ERROR', limit: 10 }), [range, tick])
  const traces = useAsync(() => searchTraces({ range, limit: 6 }), [range, tick])
  const liveAlerts = useAsync(getAlerts, [tick])
  const insights = useAsync(() => getInsights(range), [range, tick])
  const endpoints = useAsync(() => getEndpointMetrics(range), [range, tick])

  // Sync alerts into store
  useEffect(() => {
    if (liveAlerts.data) {
      store.setAlerts(liveAlerts.data)
    }
  }, [liveAlerts.data])

  const score = kpis.data
    ? Math.max(0, Math.round(100 - kpis.data.errors * 1.4 - Math.max(0, kpis.data.p95 - 350) / 35))
    : 100

  const cards = kpis.data
    ? ([
        ['Requests/sec', kpis.data.requests.toLocaleString(), 8.2, true],
        ['Avg latency', `${kpis.data.latency} ms`, 3.8, false],
        ['p95 latency', `${kpis.data.p95} ms`, 12.4, false],
        ['Error rate', `${kpis.data.errors}%`, 24.1, false],
        ['Uptime', `${kpis.data.uptime}%`, 0.02, true],
        ['Active alerts', String(kpis.data.activeAlerts), 1, false],
      ] as const)
    : []

  const activeAlertList = (liveAlerts.data ?? store.alerts).filter(a => a.status === 'firing')
  const topInsight = insights.data?.[0]
  const latestPoint = kpis.data?.series?.at(-1)

  return (
    <div className="page">
      <PageTitle
        title="Overview"
        description="Unified service health for demo-flask-app · prod"
        actions={
          <div className="flex items-center gap-2">
            {refresh > 0 && (
              <span className="live-pill">
                <Radio size={13} className="animate-pulse text-emerald-500" />
                Live ({refresh}s)
              </span>
            )}
            <Button variant="secondary" onClick={() => navigate('/health')}>
              <HeartPulse size={16} /> Stack health
            </Button>
          </div>
        }
      />

      <Card className={`health-banner ${score > 90 ? 'healthy' : 'degraded'}`}>
        <div className="health-copy">
          <div className="health-icon">
            <ShieldCheck size={24} />
          </div>
          <div>
            <strong>{score > 90 ? 'All systems operational' : 'Service degradation detected'}</strong>
            <p>
              {score > 90
                ? 'All telemetry signals are within operational SLO targets.'
                : 'Elevated error rates or latency require on-call attention.'}
            </p>
          </div>
        </div>
        <div className="score-ring" style={{ '--score': score } as React.CSSProperties}>
          <span>
            <strong>{score}</strong>
            <small>Health score</small>
          </span>
        </div>
      </Card>

      {kpis.loading ? (
        <div className="kpi-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i}>
              <Skeleton rows={2} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="kpi-grid">
          {cards.map(([label, value, change, good], i) => (
            <Card className="kpi" key={label}>
              <div className="kpi-head">
                <span>{label}</span>
                <Badge tone={good ? 'success' : i === 4 ? 'success' : 'warning'}>
                  {good ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {change}%
                </Badge>
              </div>
              <div className="kpi-value">{value}</div>
              <div className="kpi-foot">
                <span>vs previous period</span>
                <Sparkline
                  data={kpis.data!.series.slice(-14).map(p =>
                    i === 0 ? p.requests : i < 3 ? p.latency : p.errors
                  )}
                  color={good ? '#10b981' : '#6366f1'}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Primary Signal Charts */}
      <div className="grid-main">
        <Card>
          <SectionTitle
            action={
              <Button variant="ghost" onClick={() => navigate('/metrics')}>
                Open explorer <ExternalLink size={14} />
              </Button>
            }
          >
            Request rate vs error rate
          </SectionTitle>
          {kpis.data ? <MetricsChart data={kpis.data.series} /> : <Loading />}
        </Card>
        <Card>
          <SectionTitle>Latency percentiles (p50, p95, p99)</SectionTitle>
          {kpis.data ? (
            <MetricsChart data={kpis.data.series} kind="line" keys={['p50', 'p95', 'p99']} />
          ) : (
            <Loading />
          )}
        </Card>
      </div>

      {/* Infrastructure Telemetry: CPU & Memory */}
      <div className="grid-main">
        <Card>
          <div className="section-title">
            <span className="flex items-center gap-2">
              <Cpu size={16} /> Process CPU utilization
            </span>
            <Badge tone={latestPoint && latestPoint.cpu > 75 ? 'warning' : 'neutral'}>
              {latestPoint ? `${latestPoint.cpu}%` : '—'}
            </Badge>
          </div>
          {kpis.data ? (
            <MetricsChart data={kpis.data.series} kind="area" keys={['cpu']} height={160} />
          ) : (
            <Skeleton rows={4} />
          )}
        </Card>
        <Card>
          <div className="section-title">
            <span className="flex items-center gap-2">
              <Server size={16} /> Resident memory (MB)
            </span>
            <Badge tone="neutral">{latestPoint ? `${latestPoint.memory} MB` : '—'}</Badge>
          </div>
          {kpis.data ? (
            <MetricsChart data={kpis.data.series} kind="line" keys={['memory']} height={160} />
          ) : (
            <Skeleton rows={4} />
          )}
        </Card>
      </div>

      {/* Top Endpoints & Recent Errors */}
      <div className="grid-main">
        <Card>
          <SectionTitle
            action={
              <Button variant="ghost" onClick={() => navigate('/metrics')}>
                Explore metrics
              </Button>
            }
          >
            Top endpoints performance
          </SectionTitle>
          {endpoints.loading ? (
            <Skeleton rows={5} />
          ) : endpoints.data?.length ? (
            <DataTable
              columns={['Method', 'Endpoint', 'Requests', 'Avg', 'p95', 'Errors']}
              rows={endpoints.data.map(ep => [
                'GET',
                <code>{ep.endpoint}</code>,
                ep.requests,
                ep.avgLatency,
                ep.p95Latency,
                <Badge tone={parseFloat(ep.errorRate) > 5 ? 'error' : 'neutral'}>{ep.errorRate}</Badge>,
              ])}
              onRowClick={i => navigate(`/logs?endpoint=${encodeURIComponent(endpoints.data![i].endpoint)}`)}
            />
          ) : (
            <EmptyState title="No endpoint telemetry found" detail="Trigger load test to generate traffic." />
          )}
        </Card>

        <Card>
          <SectionTitle
            action={
              <Button variant="ghost" onClick={() => navigate('/logs?level=ERROR')}>
                View all logs
              </Button>
            }
          >
            Recent application errors
          </SectionTitle>
          {logs.loading ? (
            <Skeleton rows={6} />
          ) : logs.data?.length ? (
            <div className="error-feed">
              {logs.data.slice(0, 6).map(log => (
                <Button
                  variant="ghost"
                  key={log.id}
                  onClick={() => navigate(log.traceId ? `/traces/${log.traceId}` : `/logs?endpoint=${encodeURIComponent(log.endpoint)}`)}
                >
                  <span className="error-dot" />
                  <div>
                    <strong>{log.message}</strong>
                    <small>
                      <code>{log.endpoint}</code> · {new Date(log.timestamp).toLocaleTimeString()}
                    </small>
                  </div>
                  {log.traceId && <code>{log.traceId.slice(0, 8)}</code>}
                </Button>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent errors" detail="Application is operating within normal error boundaries." />
          )}
        </Card>
      </div>

      {/* Active Alerts, Insights & Recent Traces */}
      <div className="grid-thirds">
        <Card className="span-2">
          <SectionTitle action={<Button variant="ghost" onClick={() => navigate('/alerts')}>View all</Button>}>
            Active alerts ({activeAlertList.length})
          </SectionTitle>
          {activeAlertList.length ? (
            <div className="alert-list">
              {activeAlertList.map(alert => (
                <div key={alert.id}>
                  <Badge tone={alert.severity}>{alert.severity}</Badge>
                  <div>
                    <strong>{alert.name}</strong>
                    <small>
                      {alert.value}
                      {alert.unit} · threshold {alert.threshold}
                      {alert.unit} on <code>{alert.endpoint}</code>
                    </small>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/incidents/${alert.incidentId || 'INC-1042'}`)}
                  >
                    Investigate
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No active alerts firing" detail="All alert conditions are currently normal." />
          )}
        </Card>

        <Card className="insight-card">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Lightbulb size={17} /> AIOps Insights
            </span>
          </SectionTitle>
          <p>{topInsight?.description ?? 'Error rate on /error is monitored for sudden step-change anomalies.'}</p>
          <p>
            Anomalous spikes correlate automatically with <strong>database timeout</strong> spans and error logs.
          </p>
          <Button
            variant="ghost"
            onClick={() => navigate(topInsight?.targetUrl ?? '/incidents/INC-1042')}
          >
            Investigate insight →
          </Button>
        </Card>
      </div>
    </div>
  )
}

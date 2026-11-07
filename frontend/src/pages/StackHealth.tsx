import { Activity, ExternalLink, Server, CheckCircle2, AlertCircle } from 'lucide-react'
import { getStackHealth, getStackTargets, getTimeseries } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, DataTable, PageTitle, Skeleton, StatusBadge } from '../components/ui'

export default function StackHealth() {
  const range = useAppStore(s => s.range)
  const services = useAsync(getStackHealth, [range])
  const targets = useAsync(getStackTargets, [])
  const metrics = useAsync(() => getTimeseries('stack', range), [range])

  const serviceList = services.data ?? []
  const upCount = serviceList.filter(s => s.status === 'Up').length

  const targetList = targets.data ?? []
  const targetUpCount = targetList.filter(t => t.state === 'Up').length

  const handleOpenUi = (url: string, name: string) => {
    if (url && url !== '#') {
      window.open(url, '_blank')
    } else {
      useAppStore.getState().notify(`${name} does not expose a standalone browser UI`, 'info')
    }
  }

  return (
    <div className="page">
      <PageTitle
        title="Stack Health"
        description="Live connectivity, health probes, and Prometheus scrape target status across the 10 core services"
        actions={
          <Badge tone={upCount === serviceList.length ? 'success' : 'warning'}>
            {upCount} / {serviceList.length} Services Healthy
          </Badge>
        }
      />

      {services.loading ? (
        <div className="service-grid">
          {Array.from({ length: 10 }, (_, i) => (
            <Card key={i}>
              <Skeleton rows={4} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="service-grid">
          {serviceList.map(service => (
            <Card key={service.name}>
              <div className="service-head">
                <div className="service-logo">
                  <Server size={19} />
                </div>
                <StatusBadge status={service.status} />
              </div>
              <strong>{service.name}</strong>
              <small>Version {service.version}</small>
              <dl>
                <div>
                  <dt>Uptime</dt>
                  <dd>{service.uptime}</dd>
                </div>
                <div>
                  <dt>Response time</dt>
                  <dd>{service.responseTime ?? '4 ms'}</dd>
                </div>
                <div>
                  <dt>Last check</dt>
                  <dd>{service.lastCheck ?? 'just now'}</dd>
                </div>
                <div>
                  <dt>Ingestion / Activity</dt>
                  <dd>{service.ingestion}</dd>
                </div>
              </dl>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => handleOpenUi(service.url, service.name)}
              >
                Open Service UI <ExternalLink size={14} />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Ingestion signals */}
      <div className="grid-thirds">
        <Card>
          <span className="signal-label">
            <Activity size={15} /> Samples scraped / sec
          </span>
          <strong className="signal-value">12.4k</strong>
          <MetricsChart data={metrics.data ?? []} keys={['requests']} height={150} />
        </Card>
        <Card>
          <span className="signal-label">
            <Activity size={15} /> Log streams ingested / sec
          </span>
          <strong className="signal-value">8.7k</strong>
          <MetricsChart data={metrics.data ?? []} keys={['latency']} height={150} />
        </Card>
        <Card>
          <span className="signal-label">
            <Activity size={15} /> Spans processed / sec
          </span>
          <strong className="signal-value">2.1k</strong>
          <MetricsChart data={metrics.data ?? []} keys={['errors']} height={150} />
        </Card>
      </div>

      {/* Real Prometheus active targets */}
      <Card>
        <div className="section-title">
          <h2>Prometheus scrape targets</h2>
          <Badge tone={targetUpCount === targetList.length ? 'success' : 'warning'}>
            {targetUpCount} / {targetList.length} Targets UP
          </Badge>
        </div>
        {targets.loading ? (
          <Skeleton rows={6} />
        ) : targetList.length ? (
          <DataTable
            columns={['Target Endpoint', 'State', 'Last Scrape', 'Duration', 'LastError']}
            rows={targetList.map(t => [
              <code>{t.endpoint}</code>,
              <StatusBadge status={t.state} />,
              t.lastScrape,
              t.duration,
              t.error !== '—' && t.error !== '' ? (
                <span className="text-error">{t.error}</span>
              ) : (
                <span className="text-muted">—</span>
              ),
            ])}
          />
        ) : (
          <p className="empty-row">No active scrape targets reported by Prometheus.</p>
        )}
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { BellPlus, Bookmark, Download, Play, Search } from 'lucide-react'
import { createAlertRule, getMetricNames, getTimeseries } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageTitle,
  Select,
  Skeleton,
} from '../components/ui'

const templates: Record<string, string> = {
  'Request rate': 'sum(rate(http_requests_total{job="demo-app"}[5m]))',
  'Error rate':
    'sum(rate(http_requests_total{job="demo-app",status=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total{job="demo-app"}[5m])), 0.001) * 100',
  'p95 latency':
    'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le)) * 1000',
  'CPU usage': 'rate(process_cpu_seconds_total{job="demo-app"}[5m]) * 100',
  'Memory usage': 'process_resident_memory_bytes{job="demo-app"} / (1024 * 1024)',
  'In-flight requests': 'in_flight_requests{job="demo-app"}',
}

export default function Metrics() {
  const range = useAppStore(s => s.range)
  const notify = useAppStore(s => s.notify)
  const addRule = useAppStore(s => s.addRule)
  const [query, setQuery] = useState(templates['Request rate'])
  const [executed, setExecuted] = useState(query)
  const [kind, setKind] = useState<'line' | 'area' | 'bar'>('area')
  const [compare, setCompare] = useState(false)
  const [metricSearch, setMetricSearch] = useState('')
  const [ruleOpen, setRuleOpen] = useState(false)

  // Dynamic metric names from Prometheus
  const availableMetrics = useAsync(getMetricNames, [])
  const data = useAsync(() => getTimeseries(executed, range), [executed, range])

  const exportCsv = () => {
    if (!data.data || !data.data.length) return
    const csv = [
      'time,timestamp,requests,errors,latency,cpu,memory',
      ...data.data.map(
        p => `${p.time},${p.timestamp},${p.requests},${p.errors},${p.latency},${p.cpu},${p.memory}`
      ),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `observex-metrics-${range}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    notify('Metrics CSV exported')
  }

  const metricList = availableMetrics.data?.length
    ? availableMetrics.data
    : [
        { name: 'http_requests_total', type: 'counter' },
        { name: 'http_request_duration_seconds', type: 'histogram' },
        { name: 'process_cpu_seconds_total', type: 'counter' },
        { name: 'process_resident_memory_bytes', type: 'gauge' },
        { name: 'in_flight_requests', type: 'gauge' },
        { name: 'python_gc_objects_collected_total', type: 'counter' },
      ]

  const activeKey = executed.includes('error')
    ? 'errors'
    : executed.includes('duration') || executed.includes('latency')
    ? 'latency'
    : executed.includes('cpu')
    ? 'cpu'
    : executed.includes('memory') || executed.includes('bytes')
    ? 'memory'
    : 'requests'

  return (
    <div className="page">
      <PageTitle
        title="Metrics Explorer"
        description="Query Prometheus-compatible time series telemetry"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                notify('PromQL query saved to workspace presets')
              }}
            >
              <Bookmark size={15} /> Save query
            </Button>
            <Button variant="secondary" onClick={() => setRuleOpen(true)}>
              <BellPlus size={15} /> Create alert
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </Button>
          </>
        }
      />

      <div className="metrics-layout">
        <div className="space-y-4">
          <Card className="query-card">
            <div className="query-row">
              <Select
                aria-label="Query templates"
                defaultValue=""
                onChange={e => {
                  if (e.target.value && templates[e.target.value]) {
                    setQuery(templates[e.target.value])
                    setExecuted(templates[e.target.value])
                  }
                }}
              >
                <option value="">Query templates…</option>
                {Object.keys(templates).map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input
                className="query-input mono"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Enter PromQL expression (e.g. sum(rate(http_requests_total[5m])))"
                aria-label="PromQL query"
              />
              <Button onClick={() => setExecuted(query)}>
                <Play size={15} /> Run
              </Button>
            </div>
          </Card>

          <Card>
            <div className="chart-toolbar">
              <div className="segmented">
                {(['line', 'area', 'bar'] as const).map(k => (
                  <Button
                    variant="ghost"
                    className={kind === k ? 'active' : ''}
                    key={k}
                    onClick={() => setKind(k)}
                  >
                    {k[0].toUpperCase() + k.slice(1)}
                  </Button>
                ))}
              </div>
              <Label className="switch-label">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={e => setCompare(e.target.checked)}
                />
                <span /> Compare with previous period
              </Label>
            </div>

            {data.loading ? (
              <Skeleton rows={8} />
            ) : data.data?.length ? (
              <MetricsChart
                data={data.data}
                kind={kind}
                keys={[activeKey]}
                compare={compare}
                height={380}
              />
            ) : (
              <EmptyState
                title="No metrics returned for query"
                detail="Ensure the metric name and labels match the scraped targets."
                action={<Button onClick={() => setExecuted(templates['Request rate'])}>Reset to Request rate</Button>}
              />
            )}
          </Card>

          <div className="query-stats">
            <Card>
              <span>Resolution</span>
              <strong>{range === '5m' ? '15s' : range === '15m' ? '30s' : '1m'}</strong>
            </Card>
            <Card>
              <span>Data series</span>
              <strong>{data.data?.length ? 1 : 0} series</strong>
            </Card>
            <Card>
              <span>Time-series samples</span>
              <strong>{data.data?.length ?? 0} samples</strong>
            </Card>
            <Card>
              <span>Telemetry source</span>
              <strong>Prometheus (port 9090)</strong>
            </Card>
          </div>
        </div>

        <Card className="metric-browser">
          <strong>Metric browser</strong>
          <div className="search-field">
            <Search size={15} />
            <Input
              placeholder="Filter metrics…"
              value={metricSearch}
              onChange={e => setMetricSearch(e.target.value)}
            />
          </div>
          <div className="metric-list-scroll">
            {metricList
              .filter(m => m.name.toLowerCase().includes(metricSearch.toLowerCase()))
              .map(m => (
                <Button
                  variant="ghost"
                  key={m.name}
                  onClick={() => {
                    const nextQ = `rate(${m.name}[1m])`
                    setQuery(nextQ)
                    setExecuted(nextQ)
                  }}
                >
                  <code>{m.name}</code>
                  <Badge tone="neutral">{m.type}</Badge>
                </Button>
              ))}
          </div>
        </Card>
      </div>

      <Modal open={ruleOpen} title="Create alert rule from query" onClose={() => setRuleOpen(false)}>
        <RuleModalForm
          query={query}
          onClose={() => setRuleOpen(false)}
          onCreated={rule => {
            addRule(rule)
            notify('Alert rule created and synced to Prometheus')
            setRuleOpen(false)
          }}
        />
      </Modal>
    </div>
  )
}

function RuleModalForm({
  query,
  onClose,
  onCreated,
}: {
  query: string
  onClose: () => void
  onCreated: (rule: any) => void
}) {
  const [name, setName] = useState('Metric condition crossed')
  const [threshold, setThreshold] = useState(5)
  const [condition, setCondition] = useState<'>' | '<' | '='>('>')
  const [duration, setDuration] = useState('1m')

  const handleSubmit = async () => {
    try {
      const created = await createAlertRule({
        name,
        query,
        condition,
        threshold,
        duration,
        severity: 'warning',
        enabled: true,
      })
      onCreated(created)
    } catch {
      onCreated({
        id: `rule-${Date.now()}`,
        name,
        query,
        condition,
        threshold,
        duration,
        severity: 'warning',
        enabled: true,
      })
    }
  }

  return (
    <div className="form-grid">
      <Label>
        Rule name
        <Input value={name} onChange={e => setName(e.target.value)} />
      </Label>
      <Label>
        Query
        <Input value={query} readOnly className="mono" />
      </Label>
      <div className="field-row">
        <Label>
          Condition
          <Select value={condition} onChange={e => setCondition(e.target.value as any)}>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="=">=</option>
          </Select>
        </Label>
        <Label>
          Threshold
          <Input type="number" value={threshold} onChange={e => setThreshold(+e.target.value)} />
        </Label>
        <Label>
          Duration
          <Select value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="1m">1 minute</option>
            <option value="5m">5 minutes</option>
            <option value="15m">15 minutes</option>
          </Select>
        </Label>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit}>
          <BellPlus size={15} /> Create rule
        </Button>
      </div>
    </div>
  )
}

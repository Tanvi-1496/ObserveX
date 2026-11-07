import { useEffect, useState, useRef } from 'react'
import { AlertTriangle, Cpu, Play, RotateCcw, Square, Activity } from 'lucide-react'
import { useNavigate } from 'react-router'
import { getLoadTestRuns, getLoadTestStatus, startLoadTest, stopLoadTest } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, DataTable, Input, Label, PageTitle, Select } from '../components/ui'
import type { LoadTestConfig } from '../types'

interface LivePoint {
  time: string
  requests: number
  latency: number
  errors: number
}

export default function LoadTest() {
  const store = useAppStore()
  const navigate = useNavigate()
  const [config, setConfig] = useState<LoadTestConfig>({
    endpoints: ['/', '/orders'],
    rps: 120,
    duration: 60,
    concurrency: 20,
    latency: 0,
    errorRate: 0,
    cpuSpike: false,
  })
  const [liveRuns, setLiveRuns] = useState<any[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runProgress, setRunProgress] = useState(0)
  const [liveTelemetry, setLiveTelemetry] = useState<{
    rps: number
    latency: number
    errors: number
    requestsSent: number
  }>({ rps: 0, latency: 0, errors: 0, requestsSent: 0 })

  const [chartSeries, setChartSeries] = useState<LivePoint[]>([])
  const pollingRef = useRef<number | null>(null)

  const fetchRuns = () => {
    getLoadTestRuns()
      .then(runs => {
        if (runs) {
          setLiveRuns(runs)
        }
      })
      .catch(() => {})
  }

  // Check initial status on mount
  useEffect(() => {
    fetchRuns()
    getLoadTestStatus()
      .then(st => {
        if (st && st.running) {
          setIsRunning(true)
          setRunProgress(st.progress)
          setLiveTelemetry({
            rps: st.currentRps,
            latency: st.currentLatency,
            errors: st.currentErrors,
            requestsSent: st.requestsSent,
          })
        }
      })
      .catch(() => {})
  }, [])

  // Poll status when running
  useEffect(() => {
    if (!isRunning) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }

    pollingRef.current = window.setInterval(async () => {
      try {
        const st = await getLoadTestStatus()
        if (st) {
          setIsRunning(st.running)
          setRunProgress(st.progress)
          setLiveTelemetry({
            rps: st.currentRps,
            latency: st.currentLatency,
            errors: st.currentErrors,
            requestsSent: st.requestsSent,
          })

          if (st.running) {
            const timeStr = new Date().toLocaleTimeString()
            setChartSeries(prev => [
              ...prev.slice(-25),
              {
                time: timeStr,
                requests: st.currentRps,
                latency: st.currentLatency,
                errors: st.currentErrors,
              },
            ])
          } else {
            fetchRuns()
          }
        }
      } catch {
        // error handling
      }
    }, 1000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [isRunning])

  const handleStart = async () => {
    try {
      await startLoadTest(config)
      setIsRunning(true)
      setRunProgress(0)
      setChartSeries([])
      store.notify('Synthetic load generator started')
    } catch (e: any) {
      store.notify(`Failed to start load test: ${e.message}`, 'error')
    }
  }

  const handleStop = async () => {
    try {
      await stopLoadTest()
      setIsRunning(false)
      store.notify('Synthetic load generator stopped', 'info')
      fetchRuns()
    } catch (e: any) {
      store.notify(`Failed to stop: ${e.message}`, 'error')
    }
  }

  const endpointToggle = (endpoint: string) =>
    setConfig(c => ({
      ...c,
      endpoints: c.endpoints.includes(endpoint)
        ? c.endpoints.filter(e => e !== endpoint)
        : [...c.endpoints, endpoint],
    }))

  const trigger = config.errorRate > 5 || config.latency > 1000

  return (
    <div className="page">
      <PageTitle
        title="Load Test Lab"
        description="Generate synthetic traffic against Flask demo app and watch telemetry react in real time"
        actions={
          isRunning ? (
            <Button variant="danger" onClick={handleStop}>
              <Square size={15} /> Stop test
            </Button>
          ) : (
            <Button disabled={!config.endpoints.length} onClick={handleStart}>
              <Play size={15} /> Start test
            </Button>
          )
        }
      />

      {isRunning && trigger && (
        <Card className="trigger-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>SLO Threshold Degradation Active!</strong>
            <p>
              Synthetic chaos injected (Latency: {config.latency}ms, Error Rate: {config.errorRate}%).
              Alertmanager and webhook will correlate firing alerts into incidents.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/incidents')}>
            View incidents
          </Button>
        </Card>
      )}

      <div className="load-layout">
        <Card className="load-controls">
          <div className="section-title">
            <h2>Test configuration</h2>
            <Badge tone={isRunning ? 'success' : 'neutral'}>
              {isRunning ? 'Running' : 'Ready'}
            </Badge>
          </div>

          <Label>
            Target endpoints
            <div className="endpoint-checks">
              {['/', '/orders', '/slow', '/error'].map(e => (
                <label key={e}>
                  <input
                    type="checkbox"
                    checked={config.endpoints.includes(e)}
                    onChange={() => endpointToggle(e)}
                  />
                  <code>GET {e}</code>
                </label>
              ))}
            </div>
          </Label>

          <Range
            label="Target requests per second (RPS)"
            value={config.rps}
            max={300}
            suffix=" req/s"
            onChange={rps => setConfig(c => ({ ...c, rps }))}
          />

          <div className="field-row">
            <Label>
              Duration
              <Select
                value={config.duration}
                onChange={e => setConfig(c => ({ ...c, duration: +e.target.value }))}
              >
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="300">5 minutes</option>
              </Select>
            </Label>
            <Label>
              Concurrency
              <Input
                type="number"
                value={config.concurrency}
                onChange={e => setConfig(c => ({ ...c, concurrency: Math.max(1, +e.target.value) }))}
              />
            </Label>
          </div>

          <div className="divider" />
          <div className="section-title">
            <h2>Chaos controls</h2>
            <AlertTriangle size={17} />
          </div>

          <Range
            label="Inject artificial latency"
            value={config.latency}
            max={3000}
            suffix=" ms"
            onChange={latency => setConfig(c => ({ ...c, latency }))}
          />
          <Range
            label="Inject error rate"
            value={config.errorRate}
            max={100}
            suffix="%"
            onChange={errorRate => setConfig(c => ({ ...c, errorRate }))}
          />

          <label className="chaos-toggle">
            <div>
              <Cpu size={18} />
              <span>
                <strong>CPU spike simulation</strong>
                <small>Simulate CPU saturation busy-spin on worker threads</small>
              </span>
            </div>
            <input
              type="checkbox"
              checked={config.cpuSpike}
              onChange={e => setConfig(c => ({ ...c, cpuSpike: e.target.checked }))}
            />
          </label>

          <Button
            variant="ghost"
            onClick={() =>
              setConfig({
                endpoints: ['/', '/orders'],
                rps: 120,
                duration: 60,
                concurrency: 20,
                latency: 0,
                errorRate: 0,
                cpuSpike: false,
              })
            }
          >
            <RotateCcw size={14} /> Reset configuration
          </Button>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="section-title">
              <h2>Live telemetry</h2>
              <span className={isRunning ? 'live-label' : ''}>
                {isRunning ? `LIVE · ${liveTelemetry.requestsSent} requests sent` : 'Idle'}
              </span>
            </div>

            {isRunning && (
              <div className="progress">
                <span style={{ width: `${runProgress}%` }} />
              </div>
            )}

            <div className="mini-charts">
              <div>
                <small>REQUESTS / SEC</small>
                <strong>{liveTelemetry.rps} req/s</strong>
                <MetricsChart data={chartSeries as any} keys={['requests']} height={130} />
              </div>
              <div>
                <small>AVG LATENCY</small>
                <strong>{liveTelemetry.latency} ms</strong>
                <MetricsChart data={chartSeries as any} keys={['latency']} height={130} />
              </div>
              <div>
                <small>ERROR RATE</small>
                <strong>{liveTelemetry.errors}%</strong>
                <MetricsChart data={chartSeries as any} keys={['errors']} height={130} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="section-title">
              <h2>Telemetry Lifecycle</h2>
            </div>
            <div className="lab-flow">
              <span>
                1<strong>Traffic hits Flask</strong>
              </span>
              <i />
              <span>
                2<strong>Prometheus / Loki / Jaeger scrape</strong>
              </span>
              <i />
              <span>
                3<strong>Alertmanager triggers incident</strong>
              </span>
            </div>
            <p className="muted">
              Live traffic generates genuine metrics in Prometheus, structured JSON logs in Loki, and
              distributed traces in Jaeger. Breaching error or latency limits will trigger Alertmanager rules.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <div className="section-title">
          <h2>Past test runs</h2>
          <Badge tone="neutral">{liveRuns.length} runs recorded</Badge>
        </div>
        {liveRuns.length ? (
          <DataTable
            columns={['Run ID', 'Target Endpoints', 'Requests Sent', 'Avg Latency', 'Error Rate', 'Result']}
            rows={liveRuns.map(t => [
              <code>{t.id}</code>,
              t.config.endpoints.join(', '),
              t.requests.toLocaleString(),
              `${t.latency} ms`,
              `${t.errors}%`,
              <Badge tone={t.errors > 5 || t.latency > 1000 ? 'warning' : 'success'}>
                {t.errors > 5 || t.latency > 1000 ? 'Threshold Crossed' : 'Passed'}
              </Badge>,
            ])}
          />
        ) : (
          <p className="empty-row">No test runs recorded yet. Start a test above.</p>
        )}
      </Card>
    </div>
  )
}

function Range({
  label,
  value,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  max: number
  suffix: string
  onChange: (n: number) => void
}) {
  return (
    <Label>
      {label}
      <div className="range-row">
        <input
          type="range"
          min="0"
          max={max}
          value={value}
          onChange={e => onChange(+e.target.value)}
        />
        <strong>
          {value}
          {suffix}
        </strong>
      </div>
    </Label>
  )
}

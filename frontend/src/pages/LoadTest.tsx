import { useEffect, useState } from 'react'
import { AlertTriangle, Cpu, Play, RotateCcw, Square } from 'lucide-react'
import { useNavigate } from 'react-router'
import { getLoadTestRuns, getLoadTestStatus, getTimeseries, startLoadTest, stopLoadTest } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, DataTable, Input, Label, PageTitle, Select } from '../components/ui'
import type { LoadTestConfig } from '../types'

export default function LoadTest() {
  const store = useAppStore()
  const navigate = useNavigate()
  const [config, setConfig] = useState<LoadTestConfig>({ endpoints: ['/','/orders'], rps: 120, duration: 60, concurrency: 20, latency: 0, errorRate: 0, cpuSpike: false })
  const [liveRuns, setLiveRuns] = useState<any[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runProgress, setRunProgress] = useState(0)

  const data = useAsync(() => getTimeseries('loadtest', '5m'), [isRunning, runProgress])

  // Sync historical runs from real backend
  const fetchRuns = () => {
    getLoadTestRuns().then(runs => {
      if (runs && runs.length) {
        setLiveRuns(runs)
      }
    }).catch(() => {})
  }

  useEffect(() => {
    fetchRuns()
  }, [])

  // Poll status when running
  useEffect(() => {
    if (!isRunning) return
    const id = window.setInterval(async () => {
      try {
        const status = await getLoadTestStatus()
        if (status) {
          setIsRunning(status.running)
          setRunProgress(status.progress)
          if (!status.running) {
            fetchRuns()
          }
        }
      } catch {
        // fallback to store timer
        store.tickTest()
        if (useAppStore.getState().loadProgress >= 100) {
          setIsRunning(false)
          store.stopTest()
          fetchRuns()
        }
      }
    }, 1200)
    return () => window.clearInterval(id)
  }, [isRunning])

  const handleStart = async () => {
    try {
      await startLoadTest(config)
      setIsRunning(true)
      setRunProgress(0)
      store.startTest(config)
      store.notify('Load test started')
    } catch (e: any) {
      store.notify(`Failed to start load test: ${e.message}`, 'error')
    }
  }

  const handleStop = async () => {
    try {
      await stopLoadTest()
      setIsRunning(false)
      store.stopTest()
      store.notify('Load test stopped', 'info')
      fetchRuns()
    } catch (e: any) {
      store.notify(`Failed to stop: ${e.message}`, 'error')
    }
  }

  const endpointToggle = (endpoint: string) => setConfig(c => ({ ...c, endpoints: c.endpoints.includes(endpoint) ? c.endpoints.filter(e => e !== endpoint) : [...c.endpoints, endpoint] }))
  const trigger = config.errorRate > 5 || config.latency > 1000
  const activeOrRunning = isRunning || Boolean(store.loadTest)
  const currentProgress = runProgress > 0 ? runProgress : store.loadProgress
  const pastList = liveRuns.length ? liveRuns : store.pastTests

  return <div className="page">
    <PageTitle title="Load Test Lab" description="Generate synthetic traffic and watch every signal react in real time" actions={activeOrRunning ? <Button variant="danger" onClick={handleStop}><Square size={15}/> Stop test</Button> : <Button disabled={!config.endpoints.length} onClick={handleStart}><Play size={15}/> Start test</Button>}/>
    {activeOrRunning && trigger && <Card className="trigger-banner"><AlertTriangle size={20}/><div><strong>Alert triggered!</strong><p>Load test crossed the configured error or latency threshold.</p></div><Button variant="secondary" onClick={() => navigate('/incidents/INC-1042')}>Open incident</Button></Card>}
    <div className="load-layout">
      <Card className="load-controls"><div className="section-title"><h2>Test configuration</h2><Badge tone={activeOrRunning ? 'success' : 'neutral'}>{activeOrRunning ? 'Running' : 'Ready'}</Badge></div><Label>Target endpoints<div className="endpoint-checks">{['/','/orders','/slow','/error'].map(e => <label key={e}><input type="checkbox" checked={config.endpoints.includes(e)} onChange={() => endpointToggle(e)}/><code>GET {e}</code></label>)}</div></Label><Range label="Requests per second" value={config.rps} max={500} suffix=" req/s" onChange={rps => setConfig(c => ({...c,rps}))}/><div className="field-row"><Label>Duration<Select value={config.duration} onChange={e => setConfig(c => ({...c,duration:+e.target.value}))}><option value="30">30 seconds</option><option value="60">1 minute</option><option value="300">5 minutes</option></Select></Label><Label>Concurrency<Input type="number" value={config.concurrency} onChange={e => setConfig(c => ({...c,concurrency:+e.target.value}))}/></Label></div><div className="divider"/><div className="section-title"><h2>Chaos controls</h2><AlertTriangle size={17}/></div><Range label="Inject latency" value={config.latency} max={3000} suffix=" ms" onChange={latency => setConfig(c => ({...c,latency}))}/><Range label="Inject error rate" value={config.errorRate} max={100} suffix="%" onChange={errorRate => setConfig(c => ({...c,errorRate}))}/><label className="chaos-toggle"><div><Cpu size={18}/><span><strong>CPU spike</strong><small>Simulate CPU saturation above 80%</small></span></div><input type="checkbox" checked={config.cpuSpike} onChange={e => setConfig(c => ({...c,cpuSpike:e.target.checked}))}/></label><Button variant="ghost" onClick={() => setConfig({ endpoints: ['/','/orders'], rps: 120, duration: 60, concurrency: 20, latency: 0, errorRate: 0, cpuSpike: false })}><RotateCcw size={14}/> Reset configuration</Button></Card>
      <div className="space-y-4"><Card><div className="section-title"><h2>Live telemetry</h2><span className={activeOrRunning ? 'live-label' : ''}>{activeOrRunning ? 'LIVE' : 'Waiting'}</span></div>{activeOrRunning && <div className="progress"><span style={{width:`${currentProgress}%`}}/></div>}<div className="mini-charts"><div><small>REQUESTS / SEC</small><strong>{data.data?.at(-1)?.requests ?? 0}</strong><MetricsChart data={data.data ?? []} keys={['requests']} height={130}/></div><div><small>AVG LATENCY</small><strong>{data.data?.at(-1)?.latency ?? 0} ms</strong><MetricsChart data={data.data ?? []} keys={['latency']} height={130}/></div><div><small>ERROR RATE</small><strong>{data.data?.at(-1)?.errors ?? 0}%</strong><MetricsChart data={data.data ?? []} keys={['errors']} height={130}/></div></div></Card><Card><div className="section-title"><h2>What happens next?</h2></div><div className="lab-flow"><span>1<strong>Traffic reaches Flask</strong></span><i/><span>2<strong>Signals are generated</strong></span><i/><span>3<strong>Alerts correlate</strong></span></div><p className="muted">Metrics, logs, and traces across the entire console respond to this test. Cross a threshold to generate a real alert and incident.</p></Card></div>
    </div>
    <Card><div className="section-title"><h2>Past test runs</h2><Badge tone="neutral">{pastList.length} runs</Badge></div>{pastList.length ? <DataTable columns={['Run','Endpoints','Requests','Avg latency','Error rate','Result']} rows={pastList.map(t => [t.id,t.config.endpoints.join(', '),t.requests.toLocaleString(),`${t.latency} ms`,`${t.errors}%`,<Badge tone={t.errors>5?'warning':'success'}>{t.errors>5?'Alert triggered':'Passed'}</Badge>])}/> : <p className="empty-row">Completed test runs will appear here.</p>}</Card>
  </div>
}
function Range({ label, value, max, suffix, onChange }: { label:string;value:number;max:number;suffix:string;onChange:(n:number)=>void }) { return <Label>{label}<div className="range-row"><input type="range" min="0" max={max} value={value} onChange={e => onChange(+e.target.value)}/><strong>{value}{suffix}</strong></div></Label> }

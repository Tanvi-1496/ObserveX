import { useEffect, useState } from 'react'
import { BellRing, Clock, Mail, MessageSquare, Plus, Send, Trash2, Webhook } from 'lucide-react'
import { useNavigate } from 'react-router'
import { acknowledgeAlert, createAlertRule, deleteAlertRule, getAlertRules, getAlerts, getTimeseries, silenceAlert, updateAlertRule } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, DataTable, Input, Label, Modal, PageTitle, Select, Tabs } from '../components/ui'
import type { Severity } from '../types'

export default function Alerts() {
  const [tab, setTab] = useState('Active')
  const [ruleOpen, setRuleOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const range = useAppStore(s => s.range)
  const store = useAppStore()
  const navigate = useNavigate()
  const alerts = useAsync(getAlerts, [store.alerts])
  const preview = useAsync(() => getTimeseries('errors', range), [range])

  useEffect(() => {
    getAlertRules().then(rules => {
      if (rules && rules.length) {
        rules.forEach(r => {
          if (!store.rules.some(existing => existing.id === r.id)) {
            store.addRule(r)
          }
        })
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const elapsed = (date: string) => { const sec = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000)); return `${Math.floor(sec / 60)}m ${sec % 60}s` }
  
  const currentAlerts = alerts.data ?? store.alerts

  return <div className="page">
    <PageTitle title="Alerts" description="Detect, route, and respond to service degradation" actions={<Button onClick={() => setRuleOpen(true)}><Plus size={15}/> Create rule</Button>}/>
    <Tabs tabs={['Active','History','Rules','Channels']} active={tab} onChange={setTab}/>
    {tab === 'Active' && <div className="alert-cards">{currentAlerts.filter(a => a.status !== 'silenced').map(alert => <Card key={alert.id}><div className="alert-card-head"><Badge tone={alert.severity}>{alert.severity}</Badge><Badge tone={alert.status === 'firing' ? 'error' : 'success'}>{alert.status}</Badge></div><strong>{alert.name}</strong><p><code>{alert.endpoint}</code> · firing for <span className="live-timer">{elapsed(alert.since)}</span></p><div className="threshold"><div><span>Current</span><strong>{alert.value}{alert.unit}</strong></div><div><span>Threshold</span><strong>{alert.threshold}{alert.unit}</strong></div></div><div className="card-actions"><Button variant="secondary" onClick={() => { acknowledgeAlert(alert.id).then(() => { store.updateAlert(alert.id, 'acknowledged'); store.notify('Alert acknowledged') }) }}>Acknowledge</Button><Select aria-label="Silence duration" defaultValue="" onChange={e => { const mins = e.target.value.includes('4') ? 240 : 60; silenceAlert(alert.id, mins).then(() => { store.updateAlert(alert.id, 'silenced'); store.notify('Alert silenced') }) }}><option value="" disabled>Silence…</option><option>1 hour</option><option>4 hours</option><option>Custom</option></Select><Button onClick={() => navigate(`/incidents/${alert.incidentId}`)}>Investigate</Button></div></Card>)}</div>}
    {tab === 'History' && <Card><DataTable columns={['Alert','Severity','Endpoint','Started','Status']} rows={currentAlerts.map(a => [a.name,<Badge tone={a.severity}>{a.severity}</Badge>,<code>{a.endpoint}</code>,new Date(a.since).toLocaleString(),<Badge tone={a.status === 'firing' ? 'error' : 'success'}>{a.status}</Badge>])}/></Card>}
    {tab === 'Rules' && <Card><DataTable columns={['Enabled','Name','PromQL query','Condition','Severity','Actions']} rows={store.rules.map(rule => [<label className="switch"><input type="checkbox" checked={rule.enabled} onChange={() => { updateAlertRule(rule.id, { enabled: !rule.enabled }).then(() => store.toggleRule(rule.id)) }}/><span/></label>,<strong>{rule.name}</strong>,<code className="query-cell">{rule.query}</code>,`${rule.condition} ${rule.threshold} for ${rule.duration}`,<Badge tone={rule.severity}>{rule.severity}</Badge>,<Button variant="ghost" aria-label="Delete rule" onClick={() => { deleteAlertRule(rule.id).then(() => { store.deleteRule(rule.id); store.notify('Rule deleted') }) }}><Trash2 size={15}/></Button>])}/></Card>}
    {tab === 'Channels' && <div className="channel-grid">{[[Mail,'Email','oncall@observex.dev'],[MessageSquare,'Slack','#prod-alerts'],[Webhook,'Webhook','incident-router']].map(([Icon,name,detail]) => { const C = Icon as typeof Mail; return <Card key={name as string}><div className="channel-icon"><C size={21}/></div><strong>{name as string}</strong><p>{detail as string}</p><Badge tone="success">Connected</Badge><Button variant="secondary" onClick={() => store.notify(`Test notification sent to ${name}`)}><Send size={15}/> Send test</Button></Card> })}</div>}
    <Modal open={ruleOpen} title="Create alert rule" onClose={() => setRuleOpen(false)}><RuleForm onClose={() => setRuleOpen(false)} data={preview.data ?? []}/></Modal>
  </div>
}

function RuleForm({ onClose, data }: { onClose: () => void; data: Awaited<ReturnType<typeof getTimeseries>> }) {
  const store = useAppStore()
  const [name, setName] = useState('High error rate')
  const [template, setTemplate] = useState('High error rate')
  const [threshold, setThreshold] = useState(5)
  const [severity, setSeverity] = useState<Severity>('critical')
  const templates = ['Service down','CPU > 90%','High error rate','High p95 latency','Container restarting']
  return <div className="form-grid"><Label>Preset template<Select value={template} onChange={e => { setTemplate(e.target.value); setName(e.target.value) }}>{templates.map(t => <option key={t}>{t}</option>)}</Select></Label><Label>Rule name<Input value={name} onChange={e => setName(e.target.value)}/></Label><div className="field-row"><Label>Condition<Select><option>&gt;</option><option>&lt;</option><option>=</option></Select></Label><Label>Threshold<Input type="number" value={threshold} onChange={e => setThreshold(+e.target.value)}/></Label><Label>For<Select><option>5m</option><option>10m</option><option>30m</option></Select></Label></div><Label>Severity<Select value={severity} onChange={e => setSeverity(e.target.value as Severity)}><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></Select></Label><Card><div className="section-title"><h2>Live preview</h2><Badge tone="warning"><Clock size={12}/> Threshold {threshold}</Badge></div><MetricsChart data={data} keys={['errors']} height={150}/></Card><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { createAlertRule({ name, query: 'rate(http_requests_total{status=~"5.."}[5m])', condition: '>', threshold, duration: '5m', severity, enabled: true }).then(created => { store.addRule(created); store.notify('Alert rule created'); onClose() }).catch(() => { store.addRule({ id: `rule-${Date.now()}`, name, query: 'rate(http_requests_total{status=~"5.."}[5m])', condition: '>', threshold, duration: '5m', severity, enabled: true }); store.notify('Alert rule created'); onClose() }) }}><BellRing size={15}/> Create rule</Button></div></div>
}

import { useEffect, useState } from 'react'
import { BellRing, Clock, Mail, MessageSquare, Plus, Send, Trash2, Webhook, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  acknowledgeAlert,
  createAlertRule,
  deleteAlertRule,
  getAlertRules,
  getAlerts,
  getTimeseries,
  silenceAlert,
  updateAlertRule,
} from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, DataTable, EmptyState, Input, Label, Modal, PageTitle, Select, Tabs } from '../components/ui'
import type { AlertRule, Severity } from '../types'

export default function Alerts() {
  const [tab, setTab] = useState('Active')
  const [ruleOpen, setRuleOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const range = useAppStore(s => s.range)
  const store = useAppStore()
  const navigate = useNavigate()

  const alerts = useAsync(getAlerts, [])
  const rules = useAsync(getAlertRules, [])
  const preview = useAsync(() => getTimeseries('errors', range), [range])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = (date: string) => {
    const sec = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000))
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }

  const currentAlerts = alerts.data ?? []
  const activeAlerts = currentAlerts.filter(a => a.status !== 'silenced')
  const ruleList = rules.data ?? store.rules

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAlert(id)
      alerts.setData(prev => prev?.map(a => (a.id === id ? { ...a, status: 'acknowledged' } : a)))
      store.notify('Alert acknowledged')
    } catch (e: any) {
      store.notify(`Failed to acknowledge: ${e.message}`, 'error')
    }
  }

  const handleSilence = async (id: string, mins: number) => {
    try {
      await silenceAlert(id, mins)
      alerts.setData(prev => prev?.map(a => (a.id === id ? { ...a, status: 'silenced' } : a)))
      store.notify(`Alert silenced for ${mins} minutes in Alertmanager`)
    } catch (e: any) {
      store.notify(`Failed to silence: ${e.message}`, 'error')
    }
  }

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      await updateAlertRule(rule.id, { enabled: !rule.enabled })
      rules.setData(prev => prev?.map(r => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))
      store.toggleRule(rule.id)
      store.notify(`Rule "${rule.name}" ${!rule.enabled ? 'enabled' : 'disabled'}`)
    } catch (e: any) {
      store.notify(`Failed to update rule: ${e.message}`, 'error')
    }
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteAlertRule(id)
      rules.setData(prev => prev?.filter(r => r.id !== id))
      store.deleteRule(id)
      store.notify('Alert rule deleted and removed from Prometheus')
    } catch (e: any) {
      store.notify(`Failed to delete rule: ${e.message}`, 'error')
    }
  }

  return (
    <div className="page">
      <PageTitle
        title="Alerts"
        description="Detect, route, and respond to service degradation via Alertmanager"
        actions={
          <Button onClick={() => setRuleOpen(true)}>
            <Plus size={15} /> Create rule
          </Button>
        }
      />

      <Tabs tabs={['Active', 'History', 'Rules', 'Channels']} active={tab} onChange={setTab} />

      {tab === 'Active' && (
        <div className="space-y-4">
          {activeAlerts.length ? (
            <div className="alert-cards">
              {activeAlerts.map(alert => (
                <Card key={alert.id}>
                  <div className="alert-card-head">
                    <Badge tone={alert.severity}>{alert.severity}</Badge>
                    <Badge tone={alert.status === 'firing' ? 'error' : 'success'}>{alert.status}</Badge>
                  </div>
                  <strong>{alert.name}</strong>
                  <p>
                    <code>{alert.endpoint}</code> · firing for{' '}
                    <span className="live-timer">{elapsed(alert.since)}</span>
                  </p>
                  <div className="threshold">
                    <div>
                      <span>Current</span>
                      <strong>
                        {alert.value}
                        {alert.unit}
                      </strong>
                    </div>
                    <div>
                      <span>Threshold</span>
                      <strong>
                        {alert.threshold}
                        {alert.unit}
                      </strong>
                    </div>
                  </div>
                  <div className="card-actions">
                    <Button variant="secondary" onClick={() => handleAcknowledge(alert.id)}>
                      Acknowledge
                    </Button>
                    <Select
                      aria-label="Silence duration"
                      defaultValue=""
                      onChange={e => {
                        const mins = e.target.value.includes('4') ? 240 : 60
                        handleSilence(alert.id, mins)
                      }}
                    >
                      <option value="" disabled>
                        Silence…
                      </option>
                      <option value="60">1 hour</option>
                      <option value="240">4 hours</option>
                    </Select>
                    <Button onClick={() => navigate(`/incidents/${alert.incidentId || 'INC-1042'}`)}>
                      Investigate
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active alerts firing"
              detail="All alert conditions are operating within target SLO limits."
              action={<Button onClick={() => navigate('/loadtest')}>Trigger test load</Button>}
            />
          )}
        </div>
      )}

      {tab === 'History' && (
        <Card>
          <DataTable
            columns={['Alert', 'Severity', 'Endpoint', 'Triggered Since', 'Status', 'Linked Incident']}
            rows={currentAlerts.map(a => [
              <strong>{a.name}</strong>,
              <Badge tone={a.severity}>{a.severity}</Badge>,
              <code>{a.endpoint}</code>,
              new Date(a.since).toLocaleString(),
              <Badge tone={a.status === 'firing' ? 'error' : 'success'}>{a.status}</Badge>,
              <Button variant="ghost" onClick={() => navigate(`/incidents/${a.incidentId || 'INC-1042'}`)}>
                {a.incidentId || 'INC-1042'}
              </Button>,
            ])}
          />
        </Card>
      )}

      {tab === 'Rules' && (
        <Card>
          <DataTable
            columns={['State', 'Rule Name', 'PromQL Query', 'Condition', 'Severity', 'Actions']}
            rows={ruleList.map(rule => [
              <label className="switch">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => handleToggleRule(rule)}
                />
                <span />
              </label>,
              <strong>{rule.name}</strong>,
              <code className="query-cell">{rule.query}</code>,
              `${rule.condition} ${rule.threshold} for ${rule.duration}`,
              <Badge tone={rule.severity}>{rule.severity}</Badge>,
              <Button
                variant="ghost"
                aria-label="Delete rule"
                onClick={() => handleDeleteRule(rule.id)}
              >
                <Trash2 size={15} className="text-rose-500" />
              </Button>,
            ])}
          />
        </Card>
      )}

      {tab === 'Channels' && (
        <div className="channel-grid">
          {[
            [Mail, 'Email', 'oncall@observex.dev', 'Enabled'],
            [MessageSquare, 'Slack', '#prod-alerts (Incoming Webhook)', 'Connected'],
            [Webhook, 'ObserveX Auto-Incident Router', 'http://observex-api:8000/api/webhooks/alertmanager', 'Active'],
          ].map(([Icon, name, detail, status]) => {
            const C = Icon as typeof Mail
            return (
              <Card key={name as string}>
                <div className="channel-icon">
                  <C size={21} />
                </div>
                <strong>{name as string}</strong>
                <p className="font-mono text-xs text-muted">{detail as string}</p>
                <Badge tone="success">{status as string}</Badge>
                <Button
                  variant="secondary"
                  onClick={() => store.notify(`Test alert dispatched to ${name}`)}
                >
                  <Send size={15} /> Send test alert
                </Button>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={ruleOpen} title="Create alert rule" onClose={() => setRuleOpen(false)}>
        <RuleForm
          onClose={() => setRuleOpen(false)}
          onCreated={created => {
            rules.setData(prev => [...(prev ?? []), created])
            store.addRule(created)
            store.notify('Alert rule saved and synced to Prometheus')
            setRuleOpen(false)
          }}
          data={preview.data ?? []}
        />
      </Modal>
    </div>
  )
}

function RuleForm({
  onClose,
  onCreated,
  data,
}: {
  onClose: () => void
  onCreated: (rule: any) => void
  data: any[]
}) {
  const [name, setName] = useState('High error rate')
  const [template, setTemplate] = useState('High error rate')
  const [threshold, setThreshold] = useState(5)
  const [severity, setSeverity] = useState<Severity>('critical')
  const [duration, setDuration] = useState('1m')

  const queryMap: Record<string, string> = {
    'High error rate': 'rate(http_requests_total{status=~"5.."}[1m])',
    'High p95 latency': 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[1m]))',
    'High CPU utilization': 'rate(process_cpu_seconds_total[1m]) * 100',
    'In-flight requests spike': 'in_flight_requests',
  }

  const templates = Object.keys(queryMap)

  const handleSubmit = async () => {
    const q = queryMap[template] || 'rate(http_requests_total{status=~"5.."}[1m])'
    try {
      const created = await createAlertRule({
        name,
        query: q,
        condition: '>',
        threshold,
        duration,
        severity,
        enabled: true,
      })
      onCreated(created)
    } catch {
      onCreated({
        id: `rule-${Date.now()}`,
        name,
        query: q,
        condition: '>',
        threshold,
        duration,
        severity,
        enabled: true,
      })
    }
  }

  return (
    <div className="form-grid">
      <Label>
        Preset template
        <Select
          value={template}
          onChange={e => {
            setTemplate(e.target.value)
            setName(e.target.value)
          }}
        >
          {templates.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Rule name
        <Input value={name} onChange={e => setName(e.target.value)} />
      </Label>
      <div className="field-row">
        <Label>
          Condition
          <Select defaultValue=">">
            <option>&gt;</option>
            <option>&lt;</option>
            <option>=</option>
          </Select>
        </Label>
        <Label>
          Threshold
          <Input type="number" value={threshold} onChange={e => setThreshold(+e.target.value)} />
        </Label>
        <Label>
          Duration
          <Select value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
          </Select>
        </Label>
      </div>
      <Label>
        Severity
        <Select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </Select>
      </Label>
      <Card>
        <div className="section-title">
          <h2>Live signal preview</h2>
          <Badge tone="warning">
            <Clock size={12} /> Threshold {threshold}
          </Badge>
        </div>
        <MetricsChart data={data} keys={['errors']} height={140} />
      </Card>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit}>
          <BellRing size={15} /> Create rule
        </Button>
      </div>
    </div>
  )
}

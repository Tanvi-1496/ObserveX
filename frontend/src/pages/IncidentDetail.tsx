import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, FileText, Link2, MessageSquare, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import {
  addIncidentComment,
  getIncident,
  getIncidentCorrelation,
  getIncidentPostmortem,
  getTimeseries,
  resolveIncident,
  updateIncident,
} from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Loading,
  Modal,
  PageTitle,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui'

export default function IncidentDetail() {
  const { id = '' } = useParams()
  const store = useAppStore()
  const navigate = useNavigate()
  const [comment, setComment] = useState('')
  const [summary, setSummary] = useState('')
  const [postmortem, setPostmortem] = useState(false)
  const [postmortemContent, setPostmortemContent] = useState('')

  // Fetch incident directly from backend
  const liveInc = useAsync(() => getIncident(id), [id])
  const incident = liveInc.data || store.incidents.find(i => i.id === id)

  const data = useAsync(() => getTimeseries('correlation', store.range), [store.range])
  const correlation = useAsync(() => getIncidentCorrelation(id), [id, store.range])

  useEffect(() => {
    if (postmortem) {
      getIncidentPostmortem(id).then(setPostmortemContent).catch(() => {})
    }
  }, [postmortem, id])

  const tracePoints = useMemo(() => {
    if (correlation.data?.signals && correlation.data.signals.length) {
      return correlation.data.signals
    }
    return (
      data.data?.map((p, i) => ({
        ...p,
        traces: Math.round(p.p95 * (0.8 + (i % 4) / 10)),
        logs: Math.round(p.errors * 8),
      })) ?? []
    )
  }, [data.data, correlation.data])

  const rootCause = correlation.data?.rootCause

  if (liveInc.loading && !incident) {
    return (
      <div className="page">
        <Loading />
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="page">
        <EmptyState
          title="Incident not found"
          detail={`No incident matching ID "${id}" exists.`}
          action={<Button onClick={() => navigate('/incidents')}>Back to incidents</Button>}
        />
      </div>
    )
  }

  const handleStatusChange = async (nextStatus: any) => {
    try {
      const updated = await updateIncident(id, { status: nextStatus })
      liveInc.setData(updated)
      store.updateIncident(id, { status: nextStatus })
      store.notify(`Incident status updated to ${nextStatus}`)
    } catch (e: any) {
      store.notify(`Failed to update status: ${e.message}`, 'error')
    }
  }

  const handleAssigneeChange = async (nextAssignee: string) => {
    try {
      const updated = await updateIncident(id, { assignee: nextAssignee })
      liveInc.setData(updated)
      store.updateIncident(id, { assignee: nextAssignee })
      store.notify(`Incident assigned to ${nextAssignee}`)
    } catch (e: any) {
      store.notify(`Failed to update assignee: ${e.message}`, 'error')
    }
  }

  const handleAddComment = async () => {
    if (!comment.trim()) return
    try {
      const updated = await addIncidentComment(id, comment)
      liveInc.setData(updated)
      store.addComment(id, comment)
      setComment('')
      store.notify('Investigation note added')
    } catch (e: any) {
      store.notify(`Failed to add note: ${e.message}`, 'error')
    }
  }

  const handleResolve = async () => {
    if (!summary.trim()) return
    try {
      const updated = await resolveIncident(id, summary)
      liveInc.setData(updated)
      store.updateIncident(id, { status: 'Resolved', resolvedAt: new Date().toISOString() })
      store.notify('Incident marked resolved')
    } catch (e: any) {
      store.notify(`Failed to resolve incident: ${e.message}`, 'error')
    }
  }

  return (
    <div className="page">
      <Button variant="ghost" className="back-button" onClick={() => navigate('/incidents')}>
        <ArrowLeft size={16} /> All incidents
      </Button>

      <PageTitle
        title={incident.title}
        description={`${incident.id} · started ${new Date(incident.startedAt).toLocaleString()}`}
        actions={
          <>
            <Badge tone={incident.severity}>{incident.severity}</Badge>
            <Select
              aria-label="Assignee"
              value={incident.assignee}
              onChange={e => handleAssigneeChange(e.target.value)}
            >
              <option>Maya Chen</option>
              <option>Alex Kim</option>
              <option>Priya Shah</option>
              <option>Jordan Lee</option>
              <option>Unassigned</option>
            </Select>
            <Select
              aria-label="Incident status"
              value={incident.status}
              onChange={e => handleStatusChange(e.target.value)}
            >
              <option>Open</option>
              <option>Investigating</option>
              <option>Resolved</option>
            </Select>
          </>
        }
      />

      <div className="incident-layout">
        <div className="space-y-4">
          <Card>
            <div className="section-title">
              <h2>Multi-signal correlation</h2>
              <span>Shared time axis · metrics, error logs, and traces</span>
            </div>
            <div className="correlation-chart">
              <small>METRICS · ERROR RATE (%) & LATENCY (MS)</small>
              <MetricsChart data={tracePoints} keys={['errors', 'latency']} height={150} />
              <small>LOGS · ERROR VOLUME</small>
              <MetricsChart data={tracePoints} kind="bar" keys={['logs']} height={120} />
              <small>TRACES · SPAN DURATION & ACTIVITY</small>
              <MetricsChart data={tracePoints} kind="line" keys={['traces']} height={120} />
            </div>
          </Card>

          <Card className="root-cause">
            <div className="root-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="section-title">
                <h2>Suspected root cause</h2>
                <Badge tone="warning">{rootCause?.confidence ?? 86}% confidence</Badge>
              </div>
              <p>
                {rootCause?.description ??
                  `Requests to ${incident.endpoint} are failing after a simulated database timeout. Error rate spiked to 18.0%, correlated with slow database and cache child spans.`}
              </p>
              <div className="cause-grid">
                <span>
                  Failing endpoint
                  <strong>{rootCause?.failingEndpoint ?? incident.endpoint}</strong>
                </span>
                <span>
                  Frequent error
                  <strong>{rootCause?.frequentError ?? 'Simulated database timeout'}</strong>
                </span>
                <span>
                  Affected version
                  <strong>{rootCause?.affectedVersion ?? 'demo-flask-app v1.4.2'}</strong>
                </span>
              </div>
              <div className="card-actions">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/traces?endpoint=${encodeURIComponent(incident.endpoint)}`)}
                >
                  <Link2 size={14} /> Related traces
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(`/logs?endpoint=${encodeURIComponent(incident.endpoint)}&level=ERROR`)
                  }
                >
                  <Link2 size={14} /> Related logs
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="section-title">
              <h2>Investigation notes & resolution</h2>
              <MessageSquare size={17} />
            </div>
            {incident.comments.map((c, i) => (
              <div className="comment" key={i}>
                <span>{c.author.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{c.author}</strong>
                  <small>{new Date(c.time).toLocaleString()}</small>
                  <p>{c.text}</p>
                </div>
              </div>
            ))}
            <div className="comment-box">
              <Input
                placeholder="Add an investigation note…"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <Button disabled={!comment.trim()} onClick={handleAddComment}>
                Add note
              </Button>
            </div>
            <Textarea
              placeholder="Provide a resolution summary…"
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setPostmortem(true)}>
                <FileText size={15} /> Generate post-mortem
              </Button>
              <Button disabled={!summary.trim()} onClick={handleResolve}>
                <CheckCircle2 size={15} /> Mark resolved
              </Button>
            </div>
          </Card>
        </div>

        <Card className="timeline-card">
          <div className="section-title">
            <h2>Incident timeline</h2>
            <StatusBadge status={incident.status} />
          </div>
          <div className="timeline">
            {incident.timeline.map((event, i) => (
              <div key={i} className={event.kind}>
                <span />
                <div>
                  <time>{event.time}</time>
                  <strong>{event.title}</strong>
                  <p>{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={postmortem} title="Post-mortem preview" onClose={() => setPostmortem(false)}>
        <article className="postmortem">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {postmortemContent ||
              `# Incident Post-Mortem: ${incident.id} - ${incident.title}\n\nSummary:\nAlert triggered for ${incident.endpoint}.\n\nRoot Cause:\n${rootCause?.description || 'Simulated database timeout'}`}
          </pre>
          <Button
            className="w-full mt-4"
            onClick={() => {
              store.notify('Post-mortem markdown copied to clipboard')
              navigator.clipboard.writeText(postmortemContent || `Post-mortem: ${incident.title}`)
              setPostmortem(false)
            }}
          >
            Copy formatted summary
          </Button>
        </article>
      </Modal>
    </div>
  )
}

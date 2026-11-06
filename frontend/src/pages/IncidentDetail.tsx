import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, FileText, Link2, MessageSquare, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { addIncidentComment, getIncidentCorrelation, getIncidentPostmortem, getTimeseries, resolveIncident, updateIncident } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { MetricsChart } from '../components/charts'
import { Badge, Button, Card, Input, Modal, PageTitle, Select, StatusBadge, Textarea } from '../components/ui'

export default function IncidentDetail() {
  const { id = '' } = useParams()
  const store = useAppStore()
  const incident = store.incidents.find(i => i.id === id)
  const navigate = useNavigate()
  const [comment, setComment] = useState('')
  const [summary, setSummary] = useState('')
  const [postmortem, setPostmortem] = useState(false)
  const [postmortemContent, setPostmortemContent] = useState('')
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
    return data.data?.map((p, i) => ({ ...p, traces: Math.round(p.p95 * (.8 + i % 4 / 10)), logs: Math.round(p.errors * 8) })) ?? []
  }, [data.data, correlation.data])

  const rootCause = correlation.data?.rootCause

  if (!incident) return <div className="page">Incident not found.</div>
  return <div className="page">
    <Button variant="ghost" className="back-button" onClick={() => navigate('/incidents')}><ArrowLeft size={16}/> All incidents</Button>
    <PageTitle title={incident.title} description={`${incident.id} · started ${new Date(incident.startedAt).toLocaleString()}`} actions={<><Badge tone={incident.severity}>{incident.severity}</Badge><Select aria-label="Assignee" value={incident.assignee} onChange={e => { const val = e.target.value; updateIncident(id, { assignee: val }).then(() => store.updateIncident(id, { assignee: val })) }}><option>Maya Chen</option><option>Alex Kim</option><option>Priya Shah</option><option>Unassigned</option></Select><Select aria-label="Incident status" value={incident.status} onChange={e => { const val = e.target.value as typeof incident.status; updateIncident(id, { status: val }).then(() => store.updateIncident(id, { status: val })) }}><option>Open</option><option>Investigating</option><option>Resolved</option></Select></>}/>
    <div className="incident-layout">
      <div className="space-y-4">
        <Card><div className="section-title"><h2>Signal correlation</h2><span>Shared time axis · hover to inspect</span></div><div className="correlation-chart"><small>METRICS · ERROR RATE & LATENCY</small><MetricsChart data={tracePoints} keys={['errors','latency']} height={150}/><small>LOGS · VOLUME BY LEVEL</small><MetricsChart data={tracePoints} kind="bar" keys={['logs']} height={120}/><small>TRACES · REQUEST DURATION</small><MetricsChart data={tracePoints} kind="line" keys={['traces']} height={120}/></div></Card>
        <Card className="root-cause"><div className="root-icon"><Sparkles size={20}/></div><div><div className="section-title"><h2>Suspected root cause</h2><Badge tone="warning">{rootCause?.confidence ?? 86}% confidence</Badge></div><p>{rootCause?.description ?? `Requests to ${incident.endpoint} are failing after a database connection timeout. The first error log and slow trace begin within 13 seconds of the error-rate spike.`}</p><div className="cause-grid"><span>Failing endpoint<strong>{rootCause?.failingEndpoint ?? incident.endpoint}</strong></span><span>Frequent error<strong>{rootCause?.frequentError ?? 'Simulated database timeout'}</strong></span><span>Affected version<strong>{rootCause?.affectedVersion ?? 'demo-flask-app v1.4.2'}</strong></span></div><div className="card-actions"><Button variant="secondary" onClick={() => navigate(`/traces?endpoint=${encodeURIComponent(incident.endpoint)}`)}><Link2 size={14}/> Related traces</Button><Button variant="secondary" onClick={() => navigate(`/logs?endpoint=${encodeURIComponent(incident.endpoint)}&level=ERROR`)}><Link2 size={14}/> Related logs</Button></div></div></Card>
        <Card><div className="section-title"><h2>Notes & response</h2><MessageSquare size={17}/></div>{incident.comments.map((c,i) => <div className="comment" key={i}><span>{c.author.slice(0,2).toUpperCase()}</span><div><strong>{c.author}</strong><small>{new Date(c.time).toLocaleString()}</small><p>{c.text}</p></div></div>)}<div className="comment-box"><Input placeholder="Add an investigation note…" value={comment} onChange={e => setComment(e.target.value)}/><Button disabled={!comment.trim()} onClick={() => { addIncidentComment(id, comment).then(() => { store.addComment(id, comment); setComment(''); store.notify('Note added') }) }}>Add note</Button></div><Textarea placeholder="Resolution summary…" value={summary} onChange={e => setSummary(e.target.value)}/><div className="modal-actions"><Button variant="secondary" onClick={() => setPostmortem(true)}><FileText size={15}/> Generate post-mortem</Button><Button disabled={!summary.trim()} onClick={() => { resolveIncident(id, summary).then(() => { store.updateIncident(id, { status: 'Resolved', resolvedAt: new Date().toISOString() }); store.notify('Incident resolved') }) }}><CheckCircle2 size={15}/> Mark resolved</Button></div></Card>
      </div>
      <Card className="timeline-card"><div className="section-title"><h2>Incident timeline</h2><StatusBadge status={incident.status}/></div><div className="timeline">{incident.timeline.map((event,i) => <div key={i} className={event.kind}><span/><div><time>{event.time}</time><strong>{event.title}</strong><p>{event.description}</p></div></div>)}</div></Card>
    </div>
    <Modal open={postmortem} title="Post-mortem preview" onClose={() => setPostmortem(false)}><article className="postmortem"><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>{postmortemContent || `Post-mortem for ${incident.title}\n\nWhat happened:\nRequests to ${incident.endpoint} experienced elevated error rates.\n\nRoot Cause:\n${rootCause?.frequentError || 'Simulated database timeout'}`}</pre><Button className="w-full mt-4" onClick={() => { store.notify('Post-mortem copied to clipboard'); navigator.clipboard.writeText(postmortemContent || `Post-mortem: ${incident.title}`); setPostmortem(false) }}>Copy formatted summary</Button></article></Modal>
  </div>
}

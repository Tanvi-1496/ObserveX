import { ArrowRight, Clock } from 'lucide-react'
import { useNavigate } from 'react-router'
import { getIncidents } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useAsync } from '../components/Async'
import { Badge, Button, Card, DataTable, PageTitle, StatusBadge } from '../components/ui'

export default function Incidents() {
  const incidentsState = useAppStore(s => s.incidents)
  const incidents = useAsync(getIncidents, [incidentsState])
  const navigate = useNavigate()
  const duration = (start: string, end?: string) => { const min = Math.round(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 60000); return min > 60 ? `${Math.floor(min/60)}h ${min%60}m` : `${min}m` }
  return <div className="page"><PageTitle title="Incidents" description="Correlated investigations across metrics, logs, and traces"/><div className="incident-summary"><Card><span>Open</span><strong>{incidentsState.filter(i => i.status === 'Open').length}</strong></Card><Card><span>Investigating</span><strong>{incidentsState.filter(i => i.status === 'Investigating').length}</strong></Card><Card><span>MTTR · 7d</span><strong>38m</strong></Card><Card><span>Resolved · 7d</span><strong>12</strong></Card></div><Card><DataTable columns={['Incident','Severity','Status','Affected endpoint','Duration','Assignee','']} rows={(incidents.data ?? []).map(i => [<div><strong>{i.id}</strong><small>{i.title}</small></div>,<Badge tone={i.severity}>{i.severity}</Badge>,<StatusBadge status={i.status}/>,<code>{i.endpoint}</code>,<span className="flex items-center gap-1"><Clock size={13}/>{duration(i.startedAt,i.resolvedAt)}</span>,<span className="assignee"><i>{i.assignee.split(' ').map(x => x[0]).join('')}</i>{i.assignee}</span>,<Button variant="ghost"><ArrowRight size={16}/></Button>])} onRowClick={i => navigate(`/incidents/${incidents.data?.[i].id}`)}/></Card></div>
}

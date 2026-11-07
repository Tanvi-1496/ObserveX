import { ArrowRight, Clock, Plus, Siren } from 'lucide-react'
import { useNavigate } from 'react-router'
import { getIncidents } from '../lib/api'
import { useAsync } from '../components/Async'
import { Badge, Button, Card, DataTable, EmptyState, PageTitle, Skeleton, StatusBadge } from '../components/ui'

export default function Incidents() {
  const incidents = useAsync(getIncidents, [])
  const navigate = useNavigate()

  const list = incidents.data ?? []
  const openCount = list.filter(i => i.status === 'Open').length
  const investigatingCount = list.filter(i => i.status === 'Investigating').length
  const resolvedCount = list.filter(i => i.status === 'Resolved').length

  const duration = (start: string, end?: string) => {
    const min = Math.max(1, Math.round(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 60000))
    return min > 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
  }

  return (
    <div className="page">
      <PageTitle
        title="Incidents"
        description="Correlated incident investigations across metrics, logs, and distributed traces"
        actions={
          <Button variant="secondary" onClick={() => navigate('/loadtest')}>
            <Plus size={15} /> Trigger degradation in lab
          </Button>
        }
      />

      <div className="incident-summary">
        <Card>
          <span>Open</span>
          <strong className="text-rose-500">{openCount}</strong>
        </Card>
        <Card>
          <span>Investigating</span>
          <strong className="text-amber-500">{investigatingCount}</strong>
        </Card>
        <Card>
          <span>Resolved</span>
          <strong className="text-emerald-500">{resolvedCount}</strong>
        </Card>
        <Card>
          <span>Total Incidents</span>
          <strong>{list.length}</strong>
        </Card>
      </div>

      <Card>
        {incidents.loading ? (
          <Skeleton rows={8} />
        ) : list.length ? (
          <DataTable
            columns={['Incident', 'Severity', 'Status', 'Affected endpoint', 'Duration', 'Assignee', '']}
            rows={list.map(i => [
              <div>
                <strong>{i.id}</strong>
                <small>{i.title}</small>
              </div>,
              <Badge tone={i.severity}>{i.severity}</Badge>,
              <StatusBadge status={i.status} />,
              <code>{i.endpoint}</code>,
              <span className="flex items-center gap-1">
                <Clock size={13} />
                {duration(i.startedAt, i.resolvedAt)}
              </span>,
              <span className="assignee">
                <i>{i.assignee.split(' ').map(x => x[0]).join('')}</i>
                {i.assignee}
              </span>,
              <Button variant="ghost">
                <ArrowRight size={16} />
              </Button>,
            ])}
            onRowClick={i => navigate(`/incidents/${list[i].id}`)}
          />
        ) : (
          <EmptyState
            title="No incidents recorded"
            detail="Trigger an error condition or alert to generate an incident automatically."
            action={<Button onClick={() => navigate('/loadtest')}>Open Load Test Lab</Button>}
          />
        )}
      </Card>
    </div>
  )
}

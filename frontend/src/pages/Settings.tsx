import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Moon,
  Plus,
  Sun,
  Trash2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import {
  createApiKey,
  createTeamMember,
  deleteApiKey,
  deleteTeamMember,
  getApiKeys,
  getDataSources,
  getGeneralSettings,
  getNotificationSettings,
  getTeamMembers,
  testConnection,
  updateDataSources,
  updateGeneralSettings,
  updateNotificationSettings,
  updateTeamMember,
} from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { Badge, Button, Card, DataTable, Input, Label, Modal, PageTitle, Select, Tabs } from '../components/ui'
import type { ApiKey, GeneralSettings as GenType, NotificationSettings as NotifType, TeamMember } from '../types'

export default function Settings() {
  const [tab, setTab] = useState('General')
  const store = useAppStore()

  // 1. General Settings State
  const [general, setGeneral] = useState<GenType>({
    workspaceName: 'ObserveX Production',
    defaultEnvironment: 'prod',
    defaultTimeRange: '15m',
  })
  useEffect(() => {
    getGeneralSettings().then(setGeneral).catch(() => {})
  }, [])

  const saveGeneral = async () => {
    try {
      const saved = await updateGeneralSettings(general)
      setGeneral(saved)
      store.setEnvironment(saved.defaultEnvironment)
      store.setRange(saved.defaultTimeRange as any)
      store.notify('General settings saved and persisted')
    } catch (e: any) {
      store.notify(`Failed to save settings: ${e.message}`, 'error')
    }
  }

  // 2. Data Sources State
  const [dataSources, setDataSources] = useState<Record<string, string>>({
    Prometheus: 'http://prometheus:9090',
    Loki: 'http://loki:3100',
    Jaeger: 'http://jaeger:16686',
  })
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latency: number; message?: string }>>({})

  useEffect(() => {
    getDataSources().then(setDataSources).catch(() => {})
  }, [])

  const runTestConnection = async (name: string, url: string) => {
    try {
      const res = await testConnection(url)
      setTestResults(prev => ({ ...prev, [name]: res }))
      if (res.ok) {
        store.notify(`${name} connection test passed (${res.latency}ms)`)
      } else {
        store.notify(`${name} failed: ${res.message}`, 'error')
      }
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [name]: { ok: false, latency: 0, message: e.message } }))
      store.notify(`Connection failed: ${e.message}`, 'error')
    }
  }

  const saveDataSources = async () => {
    try {
      await updateDataSources(dataSources)
      store.notify('Data source configurations saved')
    } catch (e: any) {
      store.notify(`Failed to update data sources: ${e.message}`, 'error')
    }
  }

  // 3. Team & Roles State
  const [team, setTeam] = useState<TeamMember[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Editor' | 'Viewer'>('Viewer')

  const fetchTeam = () => {
    getTeamMembers().then(setTeam).catch(() => {})
  }
  useEffect(() => {
    fetchTeam()
  }, [])

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return
    try {
      await createTeamMember({ name: inviteName, email: inviteEmail, role: inviteRole })
      setInviteOpen(false)
      setInviteName('')
      setInviteEmail('')
      fetchTeam()
      store.notify('Invitation sent to new team member')
    } catch (e: any) {
      store.notify(`Failed to invite: ${e.message}`, 'error')
    }
  }

  const handleRoleChange = async (id: string, role: any) => {
    try {
      await updateTeamMember(id, { role })
      fetchTeam()
      store.notify('Team role updated')
    } catch (e: any) {
      store.notify(`Failed to update role: ${e.message}`, 'error')
    }
  }

  const handleDeleteMember = async (id: string) => {
    try {
      await deleteTeamMember(id)
      fetchTeam()
      store.notify('Team member removed')
    } catch (e: any) {
      store.notify(`Failed to remove: ${e.message}`, 'error')
    }
  }

  // 4. Notifications State
  const [notifications, setNotifications] = useState<NotifType>({
    incidentUpdates: true,
    alertDigests: true,
    weeklySloReport: false,
  })
  useEffect(() => {
    getNotificationSettings().then(setNotifications).catch(() => {})
  }, [])

  const saveNotifications = async () => {
    try {
      await updateNotificationSettings(notifications)
      store.notify('Notification preferences saved')
    } catch (e: any) {
      store.notify(`Failed to save preferences: ${e.message}`, 'error')
    }
  }

  // 5. API Keys State
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [createKeyOpen, setCreateKeyOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null)

  const fetchKeys = () => {
    getApiKeys().then(setKeys).catch(() => {})
  }
  useEffect(() => {
    fetchKeys()
  }, [])

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return
    try {
      const res = await createApiKey(newKeyName)
      setCreatedKeySecret(res.apiKey)
      setNewKeyName('')
      fetchKeys()
      store.notify('New API key generated successfully')
    } catch (e: any) {
      store.notify(`Failed to generate key: ${e.message}`, 'error')
    }
  }

  const handleDeleteKey = async (id: string) => {
    try {
      await deleteApiKey(id)
      fetchKeys()
      store.notify('API key revoked')
    } catch (e: any) {
      store.notify(`Failed to revoke key: ${e.message}`, 'error')
    }
  }

  return (
    <div className="page">
      <PageTitle title="Settings" description="Configure your ObserveX platform and integration properties" />

      <Tabs
        tabs={['General', 'Data Sources', 'Team & Roles', 'Notifications', 'Appearance', 'API Keys']}
        active={tab}
        onChange={setTab}
      />

      {/* 1. General Tab */}
      {tab === 'General' && (
        <Card className="settings-card">
          <div className="section-title">
            <h2>Workspace properties</h2>
          </div>
          <div className="form-grid">
            <Label>
              Workspace name
              <Input
                value={general.workspaceName}
                onChange={e => setGeneral({ ...general, workspaceName: e.target.value })}
              />
            </Label>
            <Label>
              Default environment
              <Select
                value={general.defaultEnvironment}
                onChange={e => setGeneral({ ...general, defaultEnvironment: e.target.value })}
              >
                <option value="dev">dev</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </Select>
            </Label>
            <Label>
              Default time range
              <Select
                value={general.defaultTimeRange}
                onChange={e => setGeneral({ ...general, defaultTimeRange: e.target.value })}
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="24h">24h</option>
              </Select>
            </Label>
            <div>
              <Button onClick={saveGeneral}>Save changes</Button>
            </div>
          </div>
        </Card>
      )}

      {/* 2. Data Sources Tab */}
      {tab === 'Data Sources' && (
        <div className="space-y-4">
          {Object.entries(dataSources).map(([name, url]) => {
            const test = testResults[name]
            return (
              <Card className="source-card" key={name}>
                <div>
                  <strong>{name}</strong>
                  <p>
                    {name === 'Prometheus'
                      ? 'Metrics telemetry'
                      : name === 'Loki'
                      ? 'Log aggregation engine'
                      : 'Distributed tracing collector'}{' '}
                    provider
                  </p>
                </div>
                <Input
                  value={url}
                  onChange={e => setDataSources({ ...dataSources, [name]: e.target.value })}
                  aria-label={`${name} URL`}
                />
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => runTestConnection(name, url)}>
                    {test ? (
                      test.ok ? (
                        <CheckCircle2 size={15} className="text-emerald-500" />
                      ) : (
                        <XCircle size={15} className="text-rose-500" />
                      )
                    ) : null}
                    Test connection
                  </Button>
                  {test && (
                    <small className={test.ok ? 'text-emerald-500 font-mono' : 'text-rose-500 font-mono'}>
                      {test.ok ? `${test.latency} ms` : 'Failed'}
                    </small>
                  )}
                </div>
              </Card>
            )
          })}
          <div className="flex justify-end">
            <Button onClick={saveDataSources}>Save data sources</Button>
          </div>
        </div>
      )}

      {/* 3. Team & Roles Tab */}
      {tab === 'Team & Roles' && (
        <Card>
          <div className="section-title">
            <h2>Team members & access control</h2>
            <Button onClick={() => setInviteOpen(true)}>
              <Plus size={15} /> Invite member
            </Button>
          </div>
          <DataTable
            columns={['Member', 'Email', 'Role', 'Status', 'Actions']}
            rows={team.map(m => [
              <span className="assignee">
                <i>{m.name.slice(0, 2).toUpperCase()}</i>
                {m.name}
              </span>,
              m.email,
              <Select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value)}>
                <option value="Admin">Admin</option>
                <option value="Editor">Editor</option>
                <option value="Viewer">Viewer</option>
              </Select>,
              <Badge tone={m.status === 'Active' ? 'success' : 'neutral'}>{m.status}</Badge>,
              <Button variant="ghost" onClick={() => handleDeleteMember(m.id)}>
                <Trash2 size={14} className="text-rose-500" />
              </Button>,
            ])}
          />
        </Card>
      )}

      {/* 4. Notifications Tab */}
      {tab === 'Notifications' && (
        <Card className="settings-card">
          <div className="section-title">
            <h2>Notification preferences</h2>
          </div>
          <Label className="chaos-toggle">
            <div>
              <span>
                <strong>Incident updates</strong>
                <small>Get notified when incident status changes or root-cause is resolved</small>
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifications.incidentUpdates}
              onChange={e => setNotifications({ ...notifications, incidentUpdates: e.target.checked })}
            />
          </Label>

          <Label className="chaos-toggle">
            <div>
              <span>
                <strong>Alert digests</strong>
                <small>Summary digest of active and firing alerts sent every 6 hours</small>
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifications.alertDigests}
              onChange={e => setNotifications({ ...notifications, alertDigests: e.target.checked })}
            />
          </Label>

          <Label className="chaos-toggle">
            <div>
              <span>
                <strong>Weekly SLO reliability report</strong>
                <small>Service availability and error budget consumption summary</small>
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifications.weeklySloReport}
              onChange={e => setNotifications({ ...notifications, weeklySloReport: e.target.checked })}
            />
          </Label>

          <div className="mt-4">
            <Button onClick={saveNotifications}>Save notification preferences</Button>
          </div>
        </Card>
      )}

      {/* 5. Appearance Tab */}
      {tab === 'Appearance' && (
        <Card className="settings-card">
          <div className="section-title">
            <h2>Display theme</h2>
            <p className="text-muted">Choose your preferred visual theme</p>
          </div>
          <div className="theme-options">
            <Button
              variant={store.theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => store.theme === 'dark' && store.toggleTheme()}
            >
              <Sun size={18} /> Light
            </Button>
            <Button
              variant={store.theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => store.theme === 'light' && store.toggleTheme()}
            >
              <Moon size={18} /> Dark
            </Button>
          </div>
        </Card>
      )}

      {/* 6. API Keys Tab */}
      {tab === 'API Keys' && (
        <Card>
          <div className="section-title">
            <h2>Ingestion & integration API keys</h2>
            <Button onClick={() => { setCreatedKeySecret(null); setCreateKeyOpen(true); }}>
              <Plus size={15} /> Create key
            </Button>
          </div>
          <DataTable
            columns={['Name', 'Key', 'Created', 'Last Used', 'Actions']}
            rows={keys.map(k => [
              <span className="flex items-center gap-2 font-medium">
                <KeyRound size={15} />
                {k.name}
              </span>,
              <code>{k.maskedKey}</code>,
              new Date(k.createdAt).toLocaleDateString(),
              k.lastUsed ?? 'Never',
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(k.maskedKey)
                    store.notify('Masked key identifier copied')
                  }}
                >
                  <Copy size={14} />
                </Button>
                <Button variant="ghost" onClick={() => handleDeleteKey(k.id)}>
                  <Trash2 size={14} className="text-rose-500" />
                </Button>
              </div>,
            ])}
          />
        </Card>
      )}

      {/* Invite Member Modal */}
      <Modal open={inviteOpen} title="Invite team member" onClose={() => setInviteOpen(false)}>
        <div className="form-grid">
          <Label>
            Full name
            <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g. Dana Scully" />
          </Label>
          <Label>
            Email address
            <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="dana@observex.dev" />
          </Label>
          <Label>
            Role
            <Select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="Viewer">Viewer</option>
            </Select>
          </Label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!inviteName || !inviteEmail} onClick={handleInvite}>
              Send invite
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create API Key Modal */}
      <Modal
        open={createKeyOpen}
        title={createdKeySecret ? 'API Key Generated' : 'Create new API key'}
        onClose={() => setCreateKeyOpen(false)}
      >
        {createdKeySecret ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-sm flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                Please copy your API key secret immediately. For security, you will not be able to view this
                token again.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={createdKeySecret} className="font-mono text-sm" />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(createdKeySecret)
                  store.notify('API key copied to clipboard')
                }}
              >
                <Copy size={15} /> Copy
              </Button>
            </div>
            <Button className="w-full" onClick={() => setCreateKeyOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="form-grid">
            <Label>
              Key description / application name
              <Input
                placeholder="e.g. GitHub Actions CI / Kubernetes Agent"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
              />
            </Label>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setCreateKeyOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!newKeyName.trim()} onClick={handleCreateKey}>
                Generate key
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

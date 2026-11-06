import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, X } from 'lucide-react'
import type { Severity } from '../types'

export const Button = ({ children, className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) => (
  <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>
)
export const IconButton = ({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button aria-label={label} title={label} className={`icon-btn ${className}`} {...props}>{children}</button>
)
export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`input ${props.className ?? ''}`} />
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`input ${props.className ?? ''}`} />
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={`input min-h-24 resize-y ${props.className ?? ''}`} />
export const Label = ({ children, className = '' }: { children: ReactNode; className?: string }) => <label className={`label ${className}`}>{children}</label>

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`card ${className}`}>{children}</section>
export const PageTitle = ({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) => (
  <div className="page-title"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>
)
export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div className="section-title"><h2>{children}</h2>{action}</div>
export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: Severity | 'success' | 'neutral' | 'error' | 'warning' | 'info' }) => <span className={`badge badge-${tone}`}>{children}</span>
export const StatusBadge = ({ status }: { status: string }) => {
  const tone = ['Up', 'OK', 'Resolved', 'healthy', 'acknowledged'].includes(status) ? 'success' : ['Down', 'Error', 'Open', 'firing'].includes(status) ? 'error' : 'warning'
  return <Badge tone={tone}>{tone === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}{status}</Badge>
}
export const Tabs = ({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) => (
  <div className="tabs" role="tablist">{tabs.map(tab => <Button variant="ghost" role="tab" aria-selected={active === tab} className={active === tab ? 'active' : ''} key={tab} onClick={() => onChange(tab)}>{tab}</Button>)}</div>
)
export const Modal = ({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) => open ? (
  <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}><div className="section-title"><h2>{title}</h2><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></div>{children}</section></div>
) : null
export const Drawer = ({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) => open ? (
  <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}><aside className="drawer" aria-label={title} onMouseDown={e => e.stopPropagation()}><div className="section-title"><h2>{title}</h2><IconButton label="Close drawer" onClick={onClose}><X size={18} /></IconButton></div>{children}</aside></div>
) : null
export const Skeleton = ({ rows = 3 }: { rows?: number }) => <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <div className={`skeleton ${i === rows - 1 ? 'w-2/3' : ''}`} key={i} />)}</div>
export const EmptyState = ({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) => <div className="empty"><Inbox size={32} /><strong>{title}</strong><p>{detail}</p>{action}</div>
export const Loading = () => <div className="loading"><LoaderCircle className="animate-spin" size={22} />Loading observability data…</div>
export const ErrorState = ({ onRetry, detail = "The observability service did not respond. Check connection and retry." }: { onRetry: () => void; detail?: string }) => <EmptyState title="Data could not be loaded" detail={detail} action={<Button onClick={onRetry}>Retry</Button>} />

export const DataTable = ({ columns, rows, onRowClick }: { columns: string[]; rows: ReactNode[][]; onRowClick?: (index: number) => void }) => (
  <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(i)}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
)

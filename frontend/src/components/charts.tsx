import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { MetricPoint, Trace } from '../types'

const axis = { tick: { fontSize: 11, fill: 'var(--muted)' }, axisLine: false, tickLine: false }
export const MetricsChart = ({ data, kind = 'area', keys = ['requests', 'errors'], height = 280, compare = false }: { data: MetricPoint[]; kind?: 'area' | 'line' | 'bar'; keys?: string[]; height?: number; compare?: boolean }) => {
  const colors = ['#6366f1', '#ef4444', '#0ea5e9']
  const common = <><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" {...axis} minTickGap={30} /><YAxis {...axis} width={38} /><Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} /><Legend /></>
  if (kind === 'bar') return <ResponsiveContainer width="100%" height={height}><BarChart data={data}>{common}{keys.map((key, i) => <Bar key={key} dataKey={key} fill={colors[i]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer>
  if (kind === 'line') return <ResponsiveContainer width="100%" height={height}><LineChart data={data}>{common}{keys.map((key, i) => <Line key={key} dataKey={key} stroke={colors[i]} strokeWidth={2} dot={false} />)}{compare && <Line dataKey={keys[0]} name="1 hour ago" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />}</LineChart></ResponsiveContainer>
  return <ResponsiveContainer width="100%" height={height}><AreaChart data={data}><defs><linearGradient id="indigoFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs>{common}{keys.map((key, i) => i === 0 ? <Area key={key} dataKey={key} stroke={colors[i]} fill="url(#indigoFill)" strokeWidth={2} /> : <Line key={key} dataKey={key} stroke={colors[i]} strokeWidth={2} dot={false} />)}</AreaChart></ResponsiveContainer>
}

export const Sparkline = ({ data, color = '#6366f1' }: { data: number[]; color?: string }) => <ResponsiveContainer width={90} height={38}><LineChart data={data.map((value, i) => ({ value, i }))}><Line dataKey="value" stroke={color} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>

export const TraceScatter = ({ traces, onSelect }: { traces: Trace[]; onSelect: (trace: Trace) => void }) => (
  <ResponsiveContainer width="100%" height={240}><ScatterChart><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {...axis} /><YAxis dataKey="duration" unit="ms" {...axis} /><Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={v => [`${v} ms`, 'Duration']} /><Scatter data={traces.map(t => ({ ...t, time: new Date(t.startTime).getTime() }))} onClick={p => onSelect(p as unknown as Trace)}>{traces.map(t => <Cell key={t.id} fill={t.status === 'error' ? '#ef4444' : '#6366f1'} />)}</Scatter></ScatterChart></ResponsiveContainer>
)

/**
 * Small presentational primitives shared by the dashboard pages. Deliberately
 * server-safe (no hooks) so server components can use them directly.
 */
import type { ReactNode } from 'react'
import type { Plan, TaskStatus } from '@/lib/types'

const TASK_STATUS: Record<TaskStatus, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-ink-100 text-ink-600' },
  running: { label: 'Working', className: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', className: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Cancelled', className: 'bg-ink-100 text-ink-500' },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status] ?? TASK_STATUS.queued
  return (
    <span className={`badge ${s.className}`}>
      {status === 'running' && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
      {s.label}
    </span>
  )
}

export function PlanBadge({ plan }: { plan: Plan }) {
  const label = plan.charAt(0).toUpperCase() + plan.slice(1)
  const className = plan === 'free' ? 'bg-ink-100 text-ink-600' : 'bg-brand-100 text-brand-700'
  return <span className={`badge ${className}`}>{label}</span>
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 h-10 w-10 rounded-xl bg-ink-100" />
      <h3 className="font-medium text-ink-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

export function ProgressBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const ratio = limit > 0 ? used / limit : 0
  const percent = Math.min(100, Math.round(ratio * 100))
  const tone = percent >= 100 ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-600'
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-600">
        <span>{label}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

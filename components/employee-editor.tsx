'use client'
/** Edit an employee's name, role, instructions, model and status. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AiEmployee } from '@/lib/types'
import { Field } from './ui'

export function EmployeeEditor({ employee, models }: { employee: AiEmployee; models: string[] }) {
  const router = useRouter()
  const [name, setName] = useState(employee.name)
  const [role, setRole] = useState(employee.role)
  const [instructions, setInstructions] = useState(employee.instructions)
  const [model, setModel] = useState(employee.model)
  const [status, setStatus] = useState<'active' | 'paused'>(employee.status === 'paused' ? 'paused' : 'active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    const res = await fetch(`/api/employees/${employee.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, role, instructions, model, status }),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error?.message ?? 'Could not save changes')
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
        </Field>
        <Field label="Role">
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} maxLength={24} />
        </Field>
        <Field label="Model">
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {[...new Set([model, ...models])].filter(Boolean).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" hint="A paused employee keeps its history but cannot be given new work.">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </Field>
      </div>

      <Field label="Instructions" hint="This is the employee's role brief, injected at the top of every task.">
        <textarea
          className="input min-h-[140px]"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={4000}
        />
      </Field>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-600">Saved.</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <span className="text-xs text-ink-500">
          Limits: {employee.limits.maxToolCalls ?? '—'} tool calls · {Math.round((employee.limits.maxDurationMs ?? 0) / 1000) || '—'}s max
        </span>
      </div>
    </form>
  )
}

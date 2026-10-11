'use client'
/**
 * Assign work to an employee. Submitting enqueues a task and routes to its page,
 * which polls until the worker completes it.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function TaskComposer({
  employeeId,
  employeeName,
  disabled,
  disabledReason,
  compact = false,
}: {
  employeeId: string
  employeeName: string
  disabled?: boolean
  disabledReason?: string
  compact?: boolean
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setBusy(true)
    setError(null)
    // Generated once per submission attempt so a retry cannot duplicate work.
    const idempotencyKey = `${employeeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employeeId, message, idempotencyKey }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error?.message ?? 'Could not assign the task')
      setBusy(false)
      return
    }
    setMessage('')
    router.push(`/dashboard/tasks/${data.task.id}`)
  }

  return (
    <form onSubmit={submit} className={compact ? '' : 'card p-6'}>
      {!compact && <h2 className="mb-1 font-medium text-ink-900">Assign a task to {employeeName}</h2>}
      <p className="mb-3 text-sm text-ink-600">
        Describe the outcome you want. The employee works in the background and the finished deliverable appears here.
      </p>
      <textarea
        className="input min-h-[104px]"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`e.g. Compare our two main competitors and summarise the tradeoffs for a non-technical founder.`}
        maxLength={8000}
        disabled={disabled || busy}
        required
      />
      {disabled && disabledReason && <p className="mt-2 text-sm text-amber-700">{disabledReason}</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-500">{message.length}/8000</span>
        <button className="btn-primary" disabled={disabled || busy || message.trim().length === 0}>
          {busy ? 'Queueing…' : 'Assign task'}
        </button>
      </div>
    </form>
  )
}

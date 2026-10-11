'use client'
/**
 * Plan upgrade action. The server owns the decision: if billing is not
 * configured, checkout returns a clear message and this surfaces it rather than
 * pretending a payment happened.
 */
import { useState } from 'react'
import type { Plan } from '@/lib/types'

export function UpgradePlan({ plan, currentPlan }: { plan: Plan; currentPlan: Plan }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setMessage(null)
    setError(null)
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error?.message ?? 'Checkout is unavailable')
      return
    }
    if (data?.authorizationUrl) {
      setMessage('Redirecting to Paystack…')
      window.location.href = data.authorizationUrl
      return
    }
    setMessage('Checkout started.')
  }

  return (
    <div>
      <button className="btn-secondary w-full" onClick={start} disabled={busy}>
        {busy ? 'Working…' : `Choose ${plan}`}
      </button>
      {plan === currentPlan && <p className="mt-2 text-center text-xs text-ink-500">Your current plan</p>}
      {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
      {message && <p className="mt-2 text-xs text-ink-600">{message}</p>}
    </div>
  )
}

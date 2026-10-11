'use client'
/** Confirm-then-mutate button used for destructive/irreversible actions. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ConfirmAction({
  url,
  method = 'DELETE',
  label,
  confirmText,
  redirectTo,
  className = 'btn-secondary',
}: {
  url: string
  method?: 'DELETE' | 'POST' | 'PATCH'
  label: string
  confirmText: string
  redirectTo?: string
  className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { method })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error?.message ?? 'Action failed')
        setBusy(false)
        return
      }
      if (redirectTo) {
        router.push(redirectTo)
      }
      router.refresh()
    } catch {
      setError('Network error')
      setBusy(false)
      return
    }
    setBusy(false)
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button className={className} onClick={run} disabled={busy}>
        {busy ? 'Working…' : label}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  )
}

'use client'
/**
 * Refreshes server-rendered data while background work is in flight. Used on
 * task views so a queued/running task updates itself without a manual reload;
 * it stops as soon as nothing is pending.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ active, intervalMs = 2500 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs, router])
  return null
}

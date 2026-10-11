'use client'
/**
 * Authenticated app shell: navigation, workspace switcher and sign-out.
 * The active workspace is re-verified server-side on every request; switching
 * here only changes the preference cookie via the API, which checks membership.
 */
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Plan } from '@/lib/types'
import { PlanBadge } from './ui'

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/employees', label: 'Employees' },
  { href: '/dashboard/tasks', label: 'Tasks' },
  { href: '/dashboard/knowledge', label: 'Knowledge' },
  { href: '/dashboard/usage', label: 'Usage & plan' },
]

function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
}

export function AppShell({
  email,
  role,
  plan,
  organizations,
  activeOrgId,
  children,
}: {
  email: string
  role: string
  plan: Plan
  organizations: { id: string; name: string; plan: Plan }[]
  activeOrgId: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const active = organizations.find((o) => o.id === activeOrgId) ?? organizations[0]

  async function switchOrg(orgId: string) {
    if (orgId === activeOrgId) return
    setBusy(true)
    await fetch('/api/organizations/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    setBusy(false)
    router.refresh()
  }

  async function signOut() {
    setBusy(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="h-7 w-7 rounded-lg bg-brand-600" />
          <span className="font-semibold tracking-tight">AI Employees</span>
        </div>

        <div className="px-3">
          <label className="px-2 text-xs font-medium uppercase tracking-wide text-ink-500">Workspace</label>
          <div className="mt-1.5">
            {organizations.length > 1 ? (
              <select
                className="input"
                value={activeOrgId}
                disabled={busy}
                onChange={(e) => switchOrg(e.target.value)}
                aria-label="Switch workspace"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="truncate rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-800">{active?.name}</div>
            )}
          </div>
        </div>

        <nav className="mt-5 flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(pathname, item.href) ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-700 hover:bg-ink-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-ink-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink-800">{email}</p>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                <span className="capitalize">{role}</span>
                <PlanBadge plan={plan} />
              </p>
            </div>
            <button className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-brand-600" />
            <span className="text-sm font-semibold">{active?.name}</span>
            <PlanBadge plan={plan} />
          </div>
          <div className="flex items-center gap-2">
            {organizations.length > 1 && (
              <select
                className="rounded-lg border border-ink-200 px-2 py-1 text-xs"
                value={activeOrgId}
                disabled={busy}
                onChange={(e) => switchOrg(e.target.value)}
                aria-label="Switch workspace"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn-ghost px-2 py-1 text-xs" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                isActive(pathname, item.href) ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}

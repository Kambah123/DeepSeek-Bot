import Link from 'next/link'
import { PLANS, PLAN_ORDER } from '@/lib/billing/plans'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600" />
          <span className="text-lg font-semibold tracking-tight">AI Employees</span>
        </div>
        <Link href="/signup" className="btn-primary">Get started</Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Simple, transparent plans</h1>
          <p className="mt-3 text-ink-600">Centralized limits and pricing. Upgrade any time as your team grows.</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id]
            return (
              <div key={id} className={`card flex flex-col p-6 ${id === 'pro' ? 'ring-2 ring-brand-500' : ''}`}>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-ink-600">{p.description}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold">${p.priceUsdMonthly}</span>
                  <span className="text-sm text-ink-500">/mo</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-ink-700">
                  <li>• {p.maxEmployees} employees</li>
                  <li>• {p.tasksPerMonth.toLocaleString()} tasks / month</li>
                  <li>• ${p.spendLimitUsd} model spend / month</li>
                  <li>• {(p.includedTokensPerMonth / 1_000_000).toFixed(0)}M included tokens</li>
                </ul>
                <Link href={`/signup?plan=${id}`} className={`btn mt-6 ${id === 'pro' ? 'btn-primary' : 'btn-secondary'}`}>
                  Choose {p.name}
                </Link>
              </div>
            )
          })}
        </div>

        <p className="mt-10 text-center text-sm text-ink-500">
          Billing is processed by Paystack. Plans are enforced server-side; usage and limits are tracked per organization.
        </p>
      </main>
    </div>
  )
}

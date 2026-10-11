import Link from 'next/link'
import { requirePageContext } from '@/lib/server/context'
import { usageSummary, listEmployees } from '@/lib/services/tenant'
import { PLANS, PLAN_ORDER, getPlan, currentPeriodStart, periodEnd } from '@/lib/billing/plans'
import { usd, num, dateTime } from '@/lib/format'
import { UpgradePlan } from '@/components/upgrade-plan'
import { PageHeader, PlanBadge, ProgressBar, Stat } from '@/components/ui'

export const dynamic = 'force-dynamic'

function planStatus(status: string | null): string {
  if (!status) return 'No subscription on record'
  switch (status) {
    case 'trialing':
      return 'Trialing'
    case 'active':
      return 'Active'
    case 'past_due':
      return 'Past due — renew to keep paid features'
    case 'canceled':
      return 'Canceled'
    default:
      return status
  }
}

export default async function UsagePage() {
  const { repos, ctx } = await requirePageContext()
  const [summary, employees, subscription, byEmployee] = await Promise.all([
    usageSummary(repos, ctx),
    listEmployees(repos, ctx),
    repos.getSubscription(ctx.organizationId),
    repos.sumUsageByEmployee(ctx.organizationId, currentPeriodStart()),
  ])

  const current = getPlan(summary.plan)
  const perEmployee = byEmployee
    .map((row) => ({
      employeeId: row.employeeId,
      name: employees.find((e) => e.id === row.employeeId)?.name ?? 'Unassigned',
      tokens: row.tokensIn + row.tokensOut,
      costUsd: row.costUsd,
    }))
    .filter((row) => row.tokens > 0 || row.costUsd > 0)
    .sort((a, b) => b.costUsd - a.costUsd)

  return (
    <>
      <PageHeader
        title={'Usage & plan'}
        description={`Billing period ${dateTime(currentPeriodStart().toISOString())} → ${dateTime(periodEnd().toISOString())}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Plan" value={<PlanBadge plan={summary.plan} />} hint={planStatus(summary.subscriptionStatus)} />
        <Stat label="Tasks" value={num(summary.tasksThisPeriod)} hint={`of ${num(summary.tasksLimit)} included`} />
        <Stat label="Model spend" value={usd(summary.spendUsd)} hint={`of ${usd(summary.spendLimitUsd)} included`} />
        <Stat label="Tokens" value={num(summary.tokensIn + summary.tokensOut)} hint={`${num(summary.tokensIn)} in · ${num(summary.tokensOut)} out`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card space-y-5 p-6">
          <h2 className="font-medium text-ink-900">This billing period</h2>
          <ProgressBar
            used={summary.tasksThisPeriod}
            limit={summary.tasksLimit}
            label={`Tasks · ${num(summary.tasksThisPeriod)} of ${num(summary.tasksLimit)}`}
          />
          <ProgressBar
            used={summary.spendUsd}
            limit={summary.spendLimitUsd}
            label={`Model spend · ${usd(summary.spendUsd)} of ${usd(summary.spendLimitUsd)}`}
          />
          <ProgressBar
            used={employees.length}
            limit={current.maxEmployees}
            label={`Employees · ${employees.length} of ${current.maxEmployees}`}
          />
          <p className="border-t border-ink-100 pt-4 text-xs text-ink-500">
            Quotas are enforced on the server before work is queued and re-checked while tasks run, so a workspace can never
            silently exceed its allowance.
          </p>
        </div>

        <div className="card p-6 lg:col-span-2">
          <h2 className="font-medium text-ink-900">Spend by employee</h2>
          {perEmployee.length === 0 ? (
            <p className="mt-2 text-sm text-ink-600">
              No model usage yet in this period. Costs appear here after your employees complete work.
            </p>
          ) : (
            <table className="mt-4 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-ink-500">
                  <th className="border-b border-ink-200 pb-2 font-medium">Employee</th>
                  <th className="border-b border-ink-200 pb-2 text-right font-medium">Tokens</th>
                  <th className="border-b border-ink-200 pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {perEmployee.map((row) => (
                  <tr key={row.employeeId ?? row.name}>
                    <td className="border-b border-ink-100 py-2 text-ink-700">
                      {row.employeeId ? (
                        <Link href={`/dashboard/employees/${row.employeeId}`} className="text-brand-600 hover:underline">
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="border-b border-ink-100 py-2 text-right tabular-nums text-ink-700">{num(row.tokens)}</td>
                    <td className="border-b border-ink-100 py-2 text-right tabular-nums text-ink-700">{usd(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-medium text-ink-900">Plans</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId]
          const isCurrent = planId === summary.plan
          return (
            <div key={planId} className={`card flex flex-col p-5 ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-ink-900">{plan.name}</h3>
                {isCurrent && <span className="badge bg-brand-100 text-brand-700">Current</span>}
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink-900">
                {plan.priceUsdMonthly === 0 ? 'Free' : `$${plan.priceUsdMonthly}`}
                {plan.priceUsdMonthly > 0 && <span className="text-sm font-normal text-ink-500">/mo</span>}
              </p>
              <p className="mt-2 flex-1 text-sm text-ink-600">{plan.description}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-ink-600">
                <li>{plan.maxEmployees} AI employee{plan.maxEmployees === 1 ? '' : 's'}</li>
                <li>{num(plan.tasksPerMonth)} tasks / month</li>
                <li>{usd(plan.spendLimitUsd)} included model spend</li>
                <li>{num(plan.includedTokensPerMonth)} tokens / month</li>
              </ul>
              <div className="mt-5">
                {planId === 'free' ? (
                  <p className="text-center text-xs text-ink-500">Included with every account</p>
                ) : isCurrent ? (
                  <p className="text-center text-xs text-ink-500">Your current plan</p>
                ) : (
                  <UpgradePlan plan={planId} currentPlan={summary.plan} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

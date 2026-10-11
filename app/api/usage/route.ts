import { json, errorResponse, requireContext } from '@/lib/api'
import { usageSummary } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'
import { getPlan, PLANS, currentPeriodStart, periodEnd } from '@/lib/billing/plans'

export async function GET() {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    const summary = await usageSummary(repos, ctx)
    const plan = getPlan(summary.plan)
    return json({
      summary,
      plan: PLANS[summary.plan],
      period: { start: currentPeriodStart().toISOString(), end: periodEnd().toISOString() },
      byEmployee: await repos.sumUsageByEmployee(ctx.organizationId, currentPeriodStart()),
    })
  } catch (err) {
    return errorResponse(err)
  }
}

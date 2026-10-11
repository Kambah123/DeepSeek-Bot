import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { getRepos } from '@/lib/db'
import { verifyTransaction } from '@/lib/billing/paystack'
import { getPlan } from '@/lib/billing/plans'
import { ForbiddenError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireContext()
    const reference = req.nextUrl.searchParams.get('reference')
    if (!reference) return json({ error: { message: 'Missing reference' } }, 422)
    // Server-side verification — never trust the redirect alone.
    const result = await verifyTransaction(reference)
    if (!result.paid) throw new ForbiddenError('Payment was not completed')
    if (result.orgId !== ctx.organizationId) throw new ForbiddenError('Reference does not match your organization')
    const repos = await getRepos()
    await repos.upsertSubscription({
      organizationId: result.orgId, plan: result.plan as any, status: 'active',
      provider: 'paystack', providerSubscriptionId: reference,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    })
    const org = await repos.getOrganization(result.orgId)
    if (org) await repos.updateOrganization(result.orgId, { plan: result.plan as any, spendLimitUsd: getPlan(result.plan as any).spendLimitUsd })
    return json({ ok: true, plan: result.plan })
  } catch (err) {
    return errorResponse(err)
  }
}

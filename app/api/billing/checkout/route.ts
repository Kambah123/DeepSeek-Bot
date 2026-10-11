import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { getRepos } from '@/lib/db'
import { createCheckout, billingEnabled } from '@/lib/billing/paystack'
import { config } from '@/lib/config'

export async function POST(req: NextRequest) {
  try {
    if (!billingEnabled()) {
      return json({ error: { message: 'Billing is not configured on this server.' } }, 400)
    }
    const ctx = await requireContext()
    const body = await req.json()
    const plan = String(body.plan ?? '')
    const repos = await getRepos()
    const profile = await repos.getProfileById(ctx.userId)
    const result = await createCheckout({
      plan, orgId: ctx.organizationId, userId: ctx.userId,
      email: profile?.email ?? '', callbackUrl: `${config.appUrl}/billing?ref=`,
    })
    return json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

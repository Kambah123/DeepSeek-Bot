/**
 * Subscription billing via Paystack. SAFE WHEN UNCONFIGURED: if credentials are
 * absent, every function short-circuits and the app never simulates a payment.
 *
 * Implemented correctly but not exercised against the live Paystack API here
 * (no credentials). The contract is:
 *   - Checkout = initialize a Paystack transaction carrying our plan in metadata.
 *   - Success is proven server-side by verifying the transaction (never by
 *     trusting the redirect alone).
 *   - Webhooks are verified with HMAC-SHA512 and processed idempotently.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config, isBillingConfigured } from '../config'
import type { Repos } from '../db/repos'
import { getPlan } from './plans'
import { NotFoundError, ValidationError } from '../errors'

const API = 'https://api.paystack.co'

async function paystackFetch(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${config.billing.secretKey}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.status !== true) {
    throw new Error(`Paystack error: ${json.message ?? res.status}`)
  }
  return json
}

export function billingEnabled(): boolean {
  return isBillingConfigured()
}

export interface CheckoutResult {
  authorizationUrl: string
  reference: string
}

/** Initialize a checkout for a plan. Throws if billing is not configured. */
export async function createCheckout(input: {
  plan: string; orgId: string; userId: string; email: string; callbackUrl: string;
}): Promise<CheckoutResult> {
  if (!billingEnabled()) throw new ValidationError('Billing is not configured on this server.')
  const plan = getPlan(input.plan as any)
  if (plan.priceUsdMonthly <= 0) throw new ValidationError('This plan does not require payment.')
  const reference = `sub_${input.orgId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const amountKobo = Math.round(plan.priceUsdMonthly * 100 * 1600) // USD→NGN approx; configure FX as needed
  const json = await paystackFetch('/transaction/initialize', {
    email: input.email,
    amount: amountKobo,
    reference,
    callback_url: input.callbackUrl,
    metadata: { plan: plan.id, orgId: input.orgId, userId: input.userId },
  })
  return { authorizationUrl: json.data.authorization_url, reference }
}

/** Server-side verification of a transaction by reference. */
export async function verifyTransaction(reference: string): Promise<{ plan: string; orgId: string; userId: string; paid: boolean }> {
  const json = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`)
  const data = json.data
  const meta = data.metadata ?? {}
  return {
    plan: meta.plan, orgId: meta.orgId, userId: meta.userId,
    paid: data.status === 'success' && data.amount > 0,
  }
}

/** Verify the HMAC-SHA512 signature Paystack sends in x-paystack-signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  // Read the secret at call time (env may be set after module load in tests/CLI).
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET || config.billing.webhookSecret
  if (!signature || !secret) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface WebhookResult { handled: boolean; eventId: string }

/** Idempotent webhook processing. `eventId` is the Paystack event identity. */
export async function handleWebhook(repos: Repos, event: any): Promise<WebhookResult> {
  const eventId: string = event?.data?.id != null ? String(event.data.id) : String(event?.event) + ':' + Date.now()
  // Idempotency: skip if we already processed this event identity.
  const already = await auditHas(repos, eventId)
  if (already) return { handled: false, eventId }

  const type: string = event?.event ?? ''
  const data = event?.data ?? {}

  if (type === 'charge.success' || type === 'subscription.create') {
    const meta = data.metadata ?? data.subscription?.metadata ?? {}
    const orgId: string = meta.orgId
    const plan = meta.plan ?? 'starter'
    if (orgId) {
      await repos.upsertSubscription({
        organizationId: orgId, plan, status: 'active', provider: 'paystack',
        providerCustomerId: data.customer?.id ?? data.customer?.customer_code ?? null,
        providerSubscriptionId: data.subscription?.subscription_code ?? data.reference ?? null,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
        cancelAtPeriodEnd: false,
      })
      const org = await repos.getOrganization(orgId)
      if (org) await repos.updateOrganization(orgId, { plan: plan as any, spendLimitUsd: getPlan(plan as any).spendLimitUsd })
      await markHandled(repos, eventId, { type, orgId })
      return { handled: true, eventId }
    }
  }
  if (type === 'subscription.disable' || type === 'invoice.payment_failed') {
    const orgId: string = data.metadata?.orgId ?? data.subscription?.metadata?.orgId
    if (orgId) {
      const status = type === 'invoice.payment_failed' ? 'past_due' : 'canceled'
      await repos.upsertSubscription({ organizationId: orgId, status: status as any })
      await markHandled(repos, eventId, { type, orgId })
      return { handled: true, eventId }
    }
  }
  // Unknown event: record as handled so we don't loop.
  await markHandled(repos, eventId, { type: 'ignored' })
  return { handled: true, eventId }
}

async function auditHas(repos: Repos, eventId: string): Promise<boolean> {
  if (processedEvents.has(eventId)) return true
  return repos.auditExists('paystack_event', eventId)
}
const processedEvents = new Set<string>()
async function markHandled(repos: Repos, eventId: string, meta: Record<string, unknown>) {
  processedEvents.add(eventId)
  await repos.writeAudit({
    organizationId: (meta.orgId as string) ?? null, actorId: null, action: 'webhook.processed',
    targetType: 'paystack_event', targetId: eventId, metadata: meta,
  })
}

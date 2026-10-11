import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { getRepos, _resetLocalDb } from '../lib/db/index.ts'
import { verifyWebhookSignature, handleWebhook, billingEnabled } from '../lib/billing/paystack.ts'

function makeEvent(orgId: string, plan: string, id: string) {
  return {
    event: 'charge.success',
    data: {
      id,
      status: 'success',
      amount: 10000,
      reference: 'sub_x',
      customer: { id: 'cust_1' },
      metadata: { orgId, plan, userId: 'u1' },
    },
  }
}

test('webhook signature verification is correct (HMAC-SHA512)', () => {
  process.env.PAYSTACK_WEBHOOK_SECRET = 'test-secret'
  const body = JSON.stringify({ event: 'charge.success', data: { id: 1 } })
  const sig = createHmac('sha512', 'test-secret').update(body).digest('hex')
  assert.equal(verifyWebhookSignature(body, sig), true)
  assert.equal(verifyWebhookSignature(body, 'deadbeef'), false)
  assert.equal(verifyWebhookSignature(body, null), false)
  // when secret not configured, verification fails closed
  process.env.PAYSTACK_WEBHOOK_SECRET = ''
  assert.equal(verifyWebhookSignature(body, sig), false)
})

test('webhook processing is idempotent and updates the subscription', async () => {
  await _resetLocalDb()
  const repos = await getRepos()
  // The org referenced by the event must exist (FK).
  const org = await repos.createOrganization({ name: 'Test Org', slug: `test-${randomUUID().slice(0, 8)}` })
  const event = makeEvent(org.id, 'pro', 'evt_unique_1')

  const first = await handleWebhook(repos, event)
  assert.equal(first.handled, true)

  // A duplicate delivery with the same event id is skipped.
  const second = await handleWebhook(repos, event)
  assert.equal(second.handled, false)

  // The subscription was synced to the paid plan.
  const sub = await repos.getSubscription(org.id)
  assert.ok(sub, 'subscription should exist')
  assert.equal(sub!.status, 'active')
  assert.equal(sub!.plan, 'pro')
})

test('billingEnabled() is false when credentials are absent', () => {
  assert.equal(billingEnabled(), false)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRepos, _resetLocalDb } from '../lib/db/index.ts'
import { LocalAuth } from '../lib/auth/core.ts'
import { authorize } from '../lib/services/authorization.ts'
import { createOrganizationForUser, createEmployee, createTask } from '../lib/services/tenant.ts'
import { getUsageSummary, withOrgMutex, decideQuota } from '../lib/quota/quota.ts'
import { getPlan } from '../lib/billing/plans.ts'
import { RateLimitError, ForbiddenError } from '../lib/errors.ts'

async function org() {
  await _resetLocalDb()
  const repos = await getRepos()
  const auth = new LocalAuth()
  const u = await auth.signUp({ email: 'q@acme.com', password: 'sup3rsecret' })
  const { organizationId } = await createOrganizationForUser(repos, { userId: u.userId, email: u.email, orgName: 'Acme' })
  const ctx = await authorize(repos, u.userId, organizationId)
  const emp = await createEmployee(repos, ctx, { template: 'operations', name: 'Ops' })
  return { repos, ctx, emp, organizationId }
}

test('race condition: concurrent task creation cannot bypass the task quota', async () => {
  const { repos, ctx, emp, organizationId } = await org()
  const limit = getPlan('free').tasksPerMonth
  const N = limit + 10
  let success = 0
  let rejected = 0
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      createTask(repos, ctx, { employeeId: emp.id, message: `task ${i}` })
        .then(() => { success++ })
        .catch(() => { rejected++ }),
    ),
  )
  // Exactly `limit` succeed; the rest are rejected (or succeed but then the count
  // is enforced). We assert the created-task count never exceeds the limit.
  const created = (await repos.listTasks(organizationId, { limit: 1000 })).filter((t) => t.status !== 'cancelled')
  assert.ok(created.length <= limit, `created ${created.length} must be <= ${limit}`)
  assert.equal(success + rejected, N)
})

test('spend limit is enforced and blocks further tasks', async () => {
  const { repos, ctx, emp, organizationId } = await org()
  // Simulate spend approaching the limit by writing usage events.
  const plan = getPlan('free')
  const limit = plan.spendLimitUsd
  await repos.recordUsage({
    organizationId, userId: ctx.userId, employeeId: emp.id, taskId: null,
    provider: 'mock', model: 'mock', tokensIn: 0, tokensOut: 0, costUsd: limit, status: 'ok',
  })
  const summary = await getUsageSummary(repos, (await repos.getOrganization(organizationId))!, await repos.getSubscription(organizationId))
  const decision = decideQuota(summary, await repos.getSubscription(organizationId), 0.01)
  assert.equal(decision.ok, false)
  assert.equal(decision.code, 'spend')
  await assert.rejects(createTask(repos, ctx, { employeeId: emp.id, message: 'x' }), (e) => e instanceof RateLimitError)
})

test('expired subscription blocks paid work', async () => {
  const { repos, ctx, emp, organizationId } = await org()
  // Move the org to a paid plan but expire the subscription.
  await repos.updateOrganization(organizationId, { plan: 'starter' })
  const sub = await repos.getSubscription(organizationId)
  await repos.upsertSubscription({ organizationId, plan: 'starter', status: 'expired' })
  const summary = await getUsageSummary(repos, (await repos.getOrganization(organizationId))!, await repos.getSubscription(organizationId))
  const decision = decideQuota(summary, await repos.getSubscription(organizationId))
  assert.equal(decision.ok, false)
  assert.equal(decision.code, 'subscription')
})

test('withOrgMutex serializes concurrent operations for the same org', async () => {
  const { repos, organizationId } = await org()
  let concurrent = 0
  let maxConcurrent = 0
  const work = () => withOrgMutex(organizationId, async () => {
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    await new Promise((r) => setTimeout(r, 10))
    concurrent--
  })
  await Promise.all(Array.from({ length: 8 }, work))
  assert.equal(maxConcurrent, 1, 'mutex must allow only one concurrent critical section per org')
})

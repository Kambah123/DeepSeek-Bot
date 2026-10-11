import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRepos, _resetLocalDb } from '../lib/db/index.ts'
import { LocalAuth } from '../lib/auth/core.ts'
import { authorize } from '../lib/services/authorization.ts'
import { createOrganizationForUser, createEmployee, createTask, listEmployees, getEmployee } from '../lib/services/tenant.ts'
import { Worker } from '../lib/queue/worker.ts'
import { getModelGateway, _resetGateway } from '../lib/gateway/gateway.ts'

async function bootstrap() {
  await _resetLocalDb()
  _resetGateway()
  const repos = await getRepos()
  const auth = new LocalAuth()
  const user = await auth.signUp({ email: 'owner@acme.com', password: 'sup3rsecret', fullName: 'Owner' })
  const { organizationId } = await createOrganizationForUser(repos, { userId: user.userId, email: user.email, orgName: 'Acme Inc' })
  const ctx = await authorize(repos, user.userId, organizationId)
  return { repos, auth, user, ctx, organizationId }
}

test('end-to-end: register → org → employee → task → worker → completed result + usage', async () => {
  const { repos, ctx, organizationId } = await bootstrap()

  // Create a Research Analyst employee from the template.
  const emp = await createEmployee(repos, ctx, { template: 'research', name: 'Researcher' })
  assert.equal(emp.organizationId, organizationId)
  assert.equal(emp.template, 'research')

  // Submit a real task.
  const task = await createTask(repos, ctx, { employeeId: emp.id, message: 'Summarize the Q3 market for electric vehicles.' })
  assert.equal(task.status, 'queued')

  // Run the worker to execute it.
  const worker = new Worker(repos)
  const processed = await worker.tick()
  assert.equal(processed, true)

  // The task is now completed with a REAL persisted result.
  const done = await repos.getTask(task.id)
  assert.equal(done?.status, 'completed')
  assert.ok(done?.output, 'task must have output')
  const content = (done!.output as any).content as string
  assert.ok(content.length > 50, 'result should be a substantive deliverable')
  assert.ok((done!.output as any).conversationId, 'output should reference a conversation')

  // Messages were persisted (user + assistant).
  const convId = (done!.output as any).conversationId
  const messages = await repos.listMessages(organizationId, convId)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[1].role, 'assistant')

  // Usage was recorded.
  const usage = await repos.sumUsage(organizationId, new Date(Date.now() - 1000))
  assert.ok(usage.tokensIn > 0 && usage.tokensOut > 0, 'usage events should be recorded')
  assert.ok(usage.costUsd > 0, 'cost should be computed')

  // Dashboard summary reflects the work.
  const emps = await listEmployees(repos, ctx)
  assert.equal(emps.length, 1)
  const fetched = await getEmployee(repos, ctx, emp.id)
  assert.equal(fetched?.name, 'Researcher')
})

test('worker is idempotent: claiming the same task twice does not double-execute', async () => {
  const { repos, ctx } = await bootstrap()
  const emp = await createEmployee(repos, ctx, { template: 'operations', name: 'Ops' })
  const task = await createTask(repos, ctx, { employeeId: emp.id, message: 'Draft an onboarding checklist.' })

  const worker = new Worker(repos)
  await worker.tick()
  // Second claim should find nothing to do (task already running/completed).
  const second = await repos.claimNextQueued('another-worker', new Date())
  assert.equal(second, null)

  const done = await repos.getTask(task.id)
  assert.equal(done?.status, 'completed')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRepos, _resetLocalDb } from '../lib/db/index.ts'
import { LocalAuth } from '../lib/auth/core.ts'
import { authorize } from '../lib/services/authorization.ts'
import {
  createOrganizationForUser, createEmployee, createTask, listEmployees, getEmployee,
  cancelTask as cancelTaskService,
} from '../lib/services/tenant.ts'
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

test('cancelling a queued task reaches a terminal state and is never executed', async () => {
  const { repos, ctx } = await bootstrap()
  const emp = await createEmployee(repos, ctx, { template: 'marketing', name: 'Marketer' })
  const task = await createTask(repos, ctx, { employeeId: emp.id, message: 'Draft next month’s social calendar.' })

  await cancelTaskService(repos, ctx, task.id)

  // Terminal immediately: a queued row left as 'queued' would be skipped by
  // claimNextQueued (cancelled = false) and orphaned forever.
  const settled = await repos.getTask(task.id)
  assert.equal(settled?.status, 'cancelled')
  assert.equal(settled?.cancelled, true)
  assert.ok(settled?.finishedAt, 'cancelled task must record finished_at')

  // No worker may pick it up afterwards.
  const worker = new Worker(repos)
  assert.equal(await worker.tick(), false)
  assert.equal((await repos.getTask(task.id))?.status, 'cancelled')
})

test('a completed task cannot be cancelled', async () => {
  const { repos, ctx } = await bootstrap()
  const emp = await createEmployee(repos, ctx, { template: 'operations', name: 'Ops' })
  const task = await createTask(repos, ctx, { employeeId: emp.id, message: 'Write the weekly ops summary.' })
  await new Worker(repos).tick()

  await assert.rejects(() => cancelTaskService(repos, ctx, task.id), /already finished/)
  assert.equal((await repos.getTask(task.id))?.status, 'completed')
})

test('a cancel that lands mid-call is never overwritten by a completed result', async () => {
  const { repos, ctx } = await bootstrap()
  const emp = await createEmployee(repos, ctx, { template: 'research', name: 'Researcher' })
  const task = await createTask(repos, ctx, { employeeId: emp.id, message: 'Prepare the quarterly board update.' })

  let releaseCall: () => void = () => {}
  const inFlight = new Promise<void>((r) => { releaseCall = r })
  let markEntered: () => void = () => {}
  const entered = new Promise<void>((r) => { markEntered = r })

  const slowGateway = {
    complete: async (req: any) => {
      markEntered()
      await inFlight
      return {
        content: 'A deliverable that must never be recorded as completed work.',
        toolCalls: [], tokensIn: 20, tokensOut: 20, costUsd: 0.0005,
        model: req.model, provider: 'test',
      }
    },
  }

  const worker = new Worker(repos, slowGateway as any)
  const ticking = worker.tick()
  await entered

  // Cancelled while the model call is still in flight.
  await cancelTaskService(repos, ctx, task.id)
  releaseCall()
  await ticking

  const settled = await repos.getTask(task.id)
  assert.equal(settled?.status, 'cancelled')
  assert.equal(settled?.output, null, 'cancelled work must not persist a deliverable')
})

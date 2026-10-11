import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createLocalRepos, _resetLocalDb } from '../lib/db/local.ts'

test('local store: schema initializes and basic CRUD + org scoping works', async () => {
  await _resetLocalDb()
  const repos = await createLocalRepos()

  const orgA = await repos.createOrganization({ name: 'Acme', slug: 'acme' })
  const orgB = await repos.createOrganization({ name: 'Other', slug: 'other' })

  const uid = randomUUID()
  const prof = await repos.upsertProfile({ id: uid, email: 'a@acme.com', fullName: 'A' })
  assert.equal(prof.email, 'a@acme.com')
  await repos.addMember({ orgId: orgA.id, userId: uid, role: 'owner' })

  const emp = await repos.createEmployee({
    orgId: orgA.id, name: 'Researcher', role: 'Research', template: 'research',
    instructions: 'do research', model: 'deepseek-chat', toolPolicy: { allow: ['search'] },
    limits: { maxToolCalls: 10 }, createdBy: uid,
  })
  assert.equal(emp.organizationId, orgA.id)

  // Org scoping: querying org B for the employee created in org A returns null.
  const crossRead = await repos.getEmployee(orgB.id, emp.id)
  assert.equal(crossRead, null, 'employee must not be readable from another org')

  const fetched = await repos.getEmployee(orgA.id, emp.id)
  assert.equal(fetched?.name, 'Researcher')

  // Usage accounting sums per org.
  await repos.recordUsage({
    organizationId: orgA.id, userId: uid, employeeId: emp.id, taskId: null,
    provider: 'mock', model: 'm', tokensIn: 10, tokensOut: 5, costUsd: 0.01, status: 'ok',
  })
  const sum = await repos.sumUsage(orgA.id, new Date(Date.now() - 1000))
  assert.equal(sum.tokensIn, 10)
  assert.equal(sum.costUsd, 0.01)
})

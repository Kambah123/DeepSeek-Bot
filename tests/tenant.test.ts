import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRepos, _resetLocalDb } from '../lib/db/index.ts'
import { LocalAuth } from '../lib/auth/core.ts'
import { authorize } from '../lib/services/authorization.ts'
import { createOrganizationForUser, createEmployee, createDocumentRecord, getEmployee, getDocument, createTask } from '../lib/services/tenant.ts'
import { ForbiddenError, NotFoundError } from '../lib/errors.ts'

async function user(repos: any, email: string) {
  const auth = new LocalAuth()
  const u = await auth.signUp({ email, password: 'sup3rsecret' })
  return u
}

test('tenant isolation: a non-member cannot access another org, and resources are org-scoped', async () => {
  await _resetLocalDb()
  const repos = await getRepos()

  const a = await user(repos, 'a@acme.com')
  const b = await user(repos, 'b@other.com')

  const orgA = await createOrganizationForUser(repos, { userId: a.userId, email: a.email, orgName: 'Acme' })
  const orgB = await createOrganizationForUser(repos, { userId: b.userId, email: b.email, orgName: 'Other' })

  const ctxA = await authorize(repos, a.userId, orgA.organizationId)
  const ctxB = await authorize(repos, b.userId, orgB.organizationId)

  // B is not a member of A → authorization is denied.
  await assert.rejects(
    authorize(repos, b.userId, orgA.organizationId),
    (e) => e instanceof ForbiddenError,
  )

  // A creates an employee + document in org A.
  const empA = await createEmployee(repos, ctxA, { template: 'research', name: 'Researcher' })
  const docA = await createDocumentRecord(repos, ctxA, {
    name: 'secret.pdf', contentType: 'application/pdf', sizeBytes: 10, storagePath: `${orgA.organizationId}/x`,
  })

  // Scoping at the data layer: org B cannot even read the row.
  const rawCrossEmp = await repos.getEmployee(orgB.organizationId, empA.id)
  assert.equal(rawCrossEmp, null, 'employee row must not be visible to another org')
  const rawCrossDoc = await repos.getDocument(orgB.organizationId, docA.id)
  assert.equal(rawCrossDoc, null, 'document row must not be visible to another org')

  // Scoping at the service layer: B asking for A's resource gets NotFound.
  await assert.rejects(getEmployee(repos, ctxB, empA.id), (e) => e instanceof NotFoundError)
  await assert.rejects(getDocument(repos, ctxB, docA.id), (e) => e instanceof NotFoundError)

  // B cannot even reference A's employee when creating a task: the employee must
  // belong to B's own org, so this is rejected.
  await assert.rejects(
    createTask(repos, ctxB, { employeeId: empA.id, message: 'hi' }),
    (e) => e instanceof NotFoundError,
  )
})

test('tenant isolation: storage path cannot be used to cross organization boundaries', async () => {
  await _resetLocalDb()
  const repos = await getRepos()
  const a = await user(repos, 'a2@acme.com')
  const b = await user(repos, 'b2@other.com')
  const orgA = await createOrganizationForUser(repos, { userId: a.userId, email: a.email, orgName: 'Acme2' })
  const orgB = await createOrganizationForUser(repos, { userId: b.userId, email: b.email, orgName: 'Other2' })
  const ctxA = await authorize(repos, a.userId, orgA.organizationId)
  const ctxB = await authorize(repos, b.userId, orgB.organizationId)

  const docA = await createDocumentRecord(repos, ctxA, {
    name: 'confidential.pdf', contentType: 'application/pdf', sizeBytes: 1, storagePath: `${orgA.organizationId}/confidential`,
  })
  // B references A's storage path directly, but the service resolves the row via
  // B's org first, so it is NotFound — bytes are never served cross-org.
  await assert.rejects(getDocument(repos, ctxB, docA.id), (e) => e instanceof NotFoundError)
})

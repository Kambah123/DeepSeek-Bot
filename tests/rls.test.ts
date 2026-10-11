import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { INIT_SQL, LOCAL_RLS_SQL } from '../lib/db/schema.ts'

/**
 * Exercises REAL Postgres RLS. pglite's default role is a superuser (RLS is
 * skipped for it), so we create a non-superuser role `appuser` and run as it with
 * a session GUC (app.user_id) — the same mechanism the local store/tests use via
 * rls-local.sql. This proves the isolation policies block cross-tenant reads and
 * writes at the database layer, not just in application code.
 */
test('RLS blocks cross-tenant reads and writes under a non-superuser role', async () => {
  const userA = randomUUID()
  const userB = randomUUID()
  const orgA = randomUUID()
  const orgB = randomUUID()
  const empA = randomUUID()
  const empB = randomUUID()
  const pg = new PGlite()
  await pg.exec(INIT_SQL)
  await pg.exec(LOCAL_RLS_SQL)
  // Set up tenants as the superuser.
  await pg.exec(`
    insert into profiles (id, email) values ('${userA}','a@x.com'), ('${userB}','b@x.com');
    insert into organizations (id, name, slug) values ('${orgA}','A','a'), ('${orgB}','B','b');
    insert into organization_members (organization_id, user_id, role) values ('${orgA}','${userA}','owner'), ('${orgB}','${userB}','owner');
    insert into ai_employees (id, organization_id, name, role, template, model) values ('${empA}','${orgA}','Ea','r','t','m'), ('${empB}','${orgB}','Eb','r','t','m');
  `)
  // Create the restricted role + grants up front (superuser, outside RLS scopes).
  await pg.exec('create role appuser login nosuperuser')
  await pg.exec('grant all on all tables in schema public to appuser')
  await pg.exec('grant execute on all functions in schema public to appuser')

  // As the superuser, data is visible (RLS skipped) — proves the rows exist.
  const allAsSuper = await pg.query<{ c: number }>('select count(*)::int as c from ai_employees where organization_id=$1', [orgB])
  assert.equal(allAsSuper.rows[0].c, 1)

  // Now act as user-a under RLS. Custom GUCs are set with set_config (which can
  // set unregistered custom variables), not SET LOCAL.
  await pg.transaction(async (tx) => {
    await tx.exec('set role appuser')
    await tx.exec(`select set_config('app.user_id', '${userA}', true)`)

    // user-a CAN read org-a's employee.
    const own = await tx.query<{ c: number }>('select count(*)::int as c from ai_employees where organization_id=$1', [orgA])
    assert.equal(own.rows[0].c, 1, 'member can read their own org')

    // user-a CANNOT read org-b's employee (policy denies).
    const cross = await tx.query<{ c: number }>('select count(*)::int as c from ai_employees where organization_id=$1', [orgB])
    assert.equal(cross.rows[0].c, 0, 'RLS must block cross-tenant read')

    // user-a CAN insert into org-a.
    await tx.query<{ c: number }>(
      `insert into ai_employees (organization_id, name, role, template, model) values ('${orgA}','new','r','t','m')`,
    )
    const after = await tx.query<{ c: number }>('select count(*)::int as c from ai_employees where organization_id=$1', [orgA])
    assert.equal(after.rows[0].c, 2)
  })

  // A denied cross-tenant insert must error (tested in its own transaction so the
  // policy violation does not abort the validating transaction).
  let blocked = false
  try {
    await pg.transaction(async (tx) => {
      await tx.exec('set role appuser')
      await tx.exec(`select set_config('app.user_id', '${userA}', true)`)
      await tx.query<{ c: number }>(
        `insert into ai_employees (organization_id, name, role, template, model) values ('${orgB}','evil','r','t','m')`,
      )
    })
  } catch {
    blocked = true
  }
  assert.equal(blocked, true, 'RLS must block cross-tenant insert')
})

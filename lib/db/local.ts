import { PGlite } from '@electric-sql/pglite'
import { INIT_SQL } from './schema'
import type {
  AiEmployee, AuditLog, Conversation, KnowledgeDocument, MemberRole, Message,
  Organization, OrganizationMember, Plan, Profile, SubStatus, Subscription,
  Task, TaskStatus, UsageEvent, MemoryItem,
} from '../types'
import type { NewDocument, NewEmployee, NewTask, Repos } from './repos'
import { randomUUID } from 'node:crypto'

// --- JSON helpers (jsonb may come back as a string from some drivers) ------
function asJson<T>(v: unknown): T {
  if (v === null || v === undefined) return v as T
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T } catch { return v as T }
  }
  return v as T
}

// --- Row mappers ---------------------------------------------------------
const toProfile = (r: any): Profile => ({
  id: r.id, email: r.email, fullName: r.full_name ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at,
})
const toOrg = (r: any): Organization => ({
  id: r.id, name: r.name, slug: r.slug, plan: r.plan,
  spendLimitUsd: Number(r.spend_limit_usd), createdAt: r.created_at, updatedAt: r.updated_at,
})
const toMember = (r: any): OrganizationMember => ({
  organizationId: r.organization_id, userId: r.user_id, role: r.role, createdAt: r.created_at,
})
const toSub = (r: any): Subscription => ({
  id: r.id, organizationId: r.organization_id, plan: r.plan, status: r.status, provider: r.provider,
  providerSubscriptionId: r.provider_subscription_id ?? null, providerCustomerId: r.provider_customer_id ?? null,
  currentPeriodStart: r.current_period_start ?? null, currentPeriodEnd: r.current_period_end ?? null,
  cancelAtPeriodEnd: r.cancel_at_period_end, createdAt: r.created_at, updatedAt: r.updated_at,
})
const toEmployee = (r: any): AiEmployee => ({
  id: r.id, organizationId: r.organization_id, name: r.name, role: r.role, template: r.template,
  instructions: r.instructions, model: r.model, toolPolicy: asJson(r.tool_policy), limits: asJson(r.limits) ?? {},
  status: r.status, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
})
const toConversation = (r: any): Conversation => ({
  id: r.id, organizationId: r.organization_id, employeeId: r.employee_id ?? null, title: r.title,
  createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
})
const toMessage = (r: any): Message => ({
  id: r.id, conversationId: r.conversation_id, organizationId: r.organization_id, role: r.role,
  content: r.content, toolCalls: asJson(r.tool_calls), toolCallId: r.tool_call_id ?? null, createdAt: r.created_at,
})
const toTask = (r: any): Task => ({
  id: r.id, organizationId: r.organization_id, employeeId: r.employee_id ?? null, conversationId: r.conversation_id ?? null,
  createdBy: r.created_by ?? null, type: r.type, status: r.status, input: asJson(r.input) ?? {},
  output: r.output === null || r.output === undefined ? null : asJson(r.output), error: r.error ?? null,
  attempts: r.attempts, maxAttempts: r.max_attempts, idempotencyKey: r.idempotency_key ?? null, cancelled: r.cancelled,
  lockedBy: r.locked_by ?? null, lockedUntil: r.locked_until ?? null, scheduledFor: r.scheduled_for,
  startedAt: r.started_at ?? null, finishedAt: r.finished_at ?? null, durationMs: r.duration_ms ?? null,
  tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: Number(r.cost_usd), createdAt: r.created_at, updatedAt: r.updated_at,
})
const toDoc = (r: any): KnowledgeDocument => ({
  id: r.id, organizationId: r.organization_id, name: r.name, storagePath: r.storage_path, contentType: r.content_type,
  sizeBytes: Number(r.size_bytes), status: r.status, extractedText: r.extracted_text ?? null, createdBy: r.created_by ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at,
})
const toMemory = (r: any): MemoryItem => ({
  id: r.id, organizationId: r.organization_id, employeeId: r.employee_id ?? null, topic: r.topic, text: r.text,
  meta: asJson(r.meta) ?? {}, createdAt: r.created_at, updatedAt: r.updated_at,
})
const toUsage = (r: any): UsageEvent => ({
  id: r.id, organizationId: r.organization_id, userId: r.user_id ?? null, employeeId: r.employee_id ?? null, taskId: r.task_id ?? null,
  provider: r.provider, model: r.model, tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: Number(r.cost_usd),
  status: r.status, createdAt: r.created_at,
})

export class LocalRepos implements Repos {
  constructor(private db: PGlite) {}

  private async q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.db.query(sql, params as any)
    return res.rows as T[]
  }
  private async one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.q<T>(sql, params)
    return rows[0] ?? null
  }

  // ---- Profiles & auth ----
  async getProfileById(id: string) {
    const r = await this.one<any>('select * from profiles where id=$1', [id])
    return r ? toProfile(r) : null
  }
  async upsertProfile(input: { id: string; email: string; fullName?: string | null }) {
    const rows = await this.q<any>(
      `insert into profiles (id, email, full_name, updated_at) values ($1,$2,$3,now())
       on conflict (id) do update set email=excluded.email, full_name=excluded.full_name, updated_at=now()
       returning *`,
      [input.id, input.email, input.fullName ?? null],
    )
    return toProfile(rows[0])
  }
  async listUserOrganizations(userId: string) {
    const rows = await this.q<any>(
      `select o.*, m.role from organizations o join organization_members m on m.organization_id=o.id where m.user_id=$1 order by o.created_at`,
      [userId],
    )
    return rows.map((r) => ({ organization: toOrg(r), role: r.role as MemberRole }))
  }

  // ---- Organizations & members ----
  async createOrganization(input: { name: string; slug: string; plan?: Plan }) {
    const rows = await this.q<any>(
      `insert into organizations (name, slug, plan) values ($1,$2,$3) returning *`,
      [input.name, input.slug, input.plan ?? 'free'],
    )
    return toOrg(rows[0])
  }
  async getOrganization(id: string) {
    const r = await this.one<any>('select * from organizations where id=$1', [id])
    return r ? toOrg(r) : null
  }
  async updateOrganization(id: string, patch: Partial<Pick<Organization, 'name' | 'plan' | 'spendLimitUsd'>>) {
    const sets: string[] = []
    const params: unknown[] = [id]
    let i = 2
    if (patch.name !== undefined) { sets.push(`name=$${i++}`); params.push(patch.name) }
    if (patch.plan !== undefined) { sets.push(`plan=$${i++}`); params.push(patch.plan) }
    if (patch.spendLimitUsd !== undefined) { sets.push(`spend_limit_usd=$${i++}`); params.push(patch.spendLimitUsd) }
    sets.push('updated_at=now()')
    const rows = await this.q<any>(`update organizations set ${sets.join(', ')} where id=$1 returning *`, params)
    return toOrg(rows[0])
  }
  async listMembers(orgId: string) {
    const rows = await this.q<any>('select * from organization_members where organization_id=$1 order by created_at', [orgId])
    return rows.map(toMember)
  }
  async getMembership(orgId: string, userId: string) {
    const r = await this.one<any>('select * from organization_members where organization_id=$1 and user_id=$2', [orgId, userId])
    return r ? toMember(r) : null
  }
  async addMember(input: { orgId: string; userId: string; role?: MemberRole }) {
    const rows = await this.q<any>(
      `insert into organization_members (organization_id, user_id, role) values ($1,$2,$3)
       on conflict (organization_id, user_id) do update set role=excluded.role returning *`,
      [input.orgId, input.userId, input.role ?? 'member'],
    )
    return toMember(rows[0])
  }
  async updateMemberRole(orgId: string, userId: string, role: MemberRole) {
    await this.q('update organization_members set role=$3 where organization_id=$1 and user_id=$2', [orgId, userId, role])
  }
  async removeMember(orgId: string, userId: string) {
    await this.q('delete from organization_members where organization_id=$1 and user_id=$2', [orgId, userId])
  }

  // ---- Subscriptions ----
  async getSubscription(orgId: string) {
    const r = await this.one<any>('select * from subscriptions where organization_id=$1 order by updated_at desc limit 1', [orgId])
    return r ? toSub(r) : null
  }
  async upsertSubscription(input: Partial<Subscription> & { organizationId: string }) {
    const fields = ['organization_id']
    const vals: unknown[] = [input.organizationId]
    const updates: string[] = []
    let i = 2
    const add = (col: string, val: unknown) => { fields.push(col); vals.push(val); updates.push(`${col}=$${i++}`) }
    if (input.plan) add('plan', input.plan)
    if (input.status) add('status', input.status)
    if (input.provider) add('provider', input.provider)
    if (input.providerSubscriptionId !== undefined) add('provider_subscription_id', input.providerSubscriptionId)
    if (input.providerCustomerId !== undefined) add('provider_customer_id', input.providerCustomerId)
    if (input.currentPeriodStart !== undefined) add('current_period_start', input.currentPeriodStart)
    if (input.currentPeriodEnd !== undefined) add('current_period_end', input.currentPeriodEnd)
    if (input.cancelAtPeriodEnd !== undefined) add('cancel_at_period_end', input.cancelAtPeriodEnd)
    updates.push('updated_at=now()')
    const rows = await this.q<any>(
      `insert into subscriptions (${fields.join(',')}) values (${fields.map((_, idx) => `$${idx + 1}`).join(',')})
       on conflict (organization_id, provider) do update set ${updates.join(', ')} returning *`,
      vals,
    )
    return toSub(rows[0])
  }

  // ---- Employees ----
  async listEmployees(orgId: string) {
    const rows = await this.q<any>('select * from ai_employees where organization_id=$1 order by created_at', [orgId])
    return rows.map(toEmployee)
  }
  async getEmployee(orgId: string, id: string) {
    const r = await this.one<any>('select * from ai_employees where organization_id=$1 and id=$2', [orgId, id])
    return r ? toEmployee(r) : null
  }
  async createEmployee(input: NewEmployee) {
    const rows = await this.q<any>(
      `insert into ai_employees (organization_id, name, role, template, instructions, model, tool_policy, limits, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) returning *`,
      [input.orgId, input.name, input.role, input.template, input.instructions, input.model,
       JSON.stringify(input.toolPolicy), JSON.stringify(input.limits), input.createdBy],
    )
    return toEmployee(rows[0])
  }
  async updateEmployee(orgId: string, id: string, patch: Partial<NewEmployee> & { status?: 'active' | 'paused' }) {
    const sets: string[] = []
    const params: unknown[] = [orgId, id]
    let i = 3
    const set = (col: string, val: unknown) => { sets.push(`${col}=$${i++}`); params.push(val) }
    if (patch.name !== undefined) set('name', patch.name)
    if (patch.role !== undefined) set('role', patch.role)
    if (patch.template !== undefined) set('template', patch.template)
    if (patch.instructions !== undefined) set('instructions', patch.instructions)
    if (patch.model !== undefined) set('model', patch.model)
    if (patch.toolPolicy !== undefined) set('tool_policy', JSON.stringify(patch.toolPolicy))
    if (patch.limits !== undefined) set('limits', JSON.stringify(patch.limits))
    if (patch.status !== undefined) set('status', patch.status)
    // jsonb columns need explicit cast when passed as string
    const sql = `update ai_employees set ${sets.join(', ')}, updated_at=now() where organization_id=$1 and id=$2 returning *`
    const rows = await this.q<any>(sql, params)
    return toEmployee(rows[0])
  }
  async deleteEmployee(orgId: string, id: string) {
    await this.q('delete from ai_employees where organization_id=$1 and id=$2', [orgId, id])
  }

  // ---- Conversations & messages ----
  async listConversations(orgId: string, opts?: { employeeId?: string }) {
    if (opts?.employeeId) {
      const rows = await this.q<any>('select * from conversations where organization_id=$1 and employee_id=$2 order by updated_at desc', [orgId, opts.employeeId])
      return rows.map(toConversation)
    }
    const rows = await this.q<any>('select * from conversations where organization_id=$1 order by updated_at desc', [orgId])
    return rows.map(toConversation)
  }
  async getConversation(orgId: string, id: string) {
    const r = await this.one<any>('select * from conversations where organization_id=$1 and id=$2', [orgId, id])
    return r ? toConversation(r) : null
  }
  async createConversation(input: { orgId: string; employeeId: string | null; title?: string; createdBy: string | null }) {
    const rows = await this.q<any>(
      `insert into conversations (organization_id, employee_id, title, created_by) values ($1,$2,$3,$4) returning *`,
      [input.orgId, input.employeeId, input.title ?? 'New conversation', input.createdBy],
    )
    return toConversation(rows[0])
  }
  async renameConversation(orgId: string, id: string, title: string) {
    await this.q('update conversations set title=$3, updated_at=now() where organization_id=$1 and id=$2', [orgId, id, title])
  }
  async listMessages(orgId: string, conversationId: string) {
    const rows = await this.q<any>(
      'select * from messages where organization_id=$1 and conversation_id=$2 order by created_at',
      [orgId, conversationId],
    )
    return rows.map(toMessage)
  }
  async addMessage(input: { conversationId: string; orgId: string; role: Message['role']; content: string; toolCalls?: unknown; toolCallId?: string | null }) {
    const rows = await this.q<any>(
      `insert into messages (conversation_id, organization_id, role, content, tool_calls, tool_call_id)
       values ($1,$2,$3,$4,$5::jsonb,$6) returning *`,
      [input.conversationId, input.orgId, input.role, input.content,
       input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls), input.toolCallId ?? null],
    )
    return toMessage(rows[0])
  }

  // ---- Tasks ----
  async createTask(input: NewTask) {
    const rows = await this.q<any>(
      `insert into tasks (organization_id, employee_id, conversation_id, created_by, type, input, idempotency_key, max_attempts)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) returning *`,
      [input.orgId, input.employeeId, input.conversationId, input.createdBy, input.type,
       JSON.stringify(input.input), input.idempotencyKey ?? null, input.maxAttempts ?? 3],
    )
    return toTask(rows[0])
  }
  async getTask(id: string) {
    const r = await this.one<any>('select * from tasks where id=$1', [id])
    return r ? toTask(r) : null
  }
  async getTaskByIdempotencyKey(orgId: string, key: string) {
    const r = await this.one<any>('select * from tasks where organization_id=$1 and idempotency_key=$2', [orgId, key])
    return r ? toTask(r) : null
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const sets: string[] = []
    const params: unknown[] = [id]
    let i = 2
    const set = (col: string, val: unknown) => { sets.push(`${col}=$${i++}`); params.push(val) }
    if (patch.status !== undefined) set('status', patch.status)
    if (patch.output !== undefined) set('output', JSON.stringify(patch.output))
    if (patch.error !== undefined) set('error', patch.error)
    if (patch.attempts !== undefined) set('attempts', patch.attempts)
    if (patch.maxAttempts !== undefined) set('max_attempts', patch.maxAttempts)
    if (patch.cancelled !== undefined) set('cancelled', patch.cancelled)
    if (patch.lockedBy !== undefined) set('locked_by', patch.lockedBy)
    if (patch.lockedUntil !== undefined) set('locked_until', patch.lockedUntil)
    if (patch.startedAt !== undefined) set('started_at', patch.startedAt)
    if (patch.finishedAt !== undefined) set('finished_at', patch.finishedAt)
    if (patch.durationMs !== undefined) set('duration_ms', patch.durationMs)
    if (patch.tokensIn !== undefined) set('tokens_in', patch.tokensIn)
    if (patch.tokensOut !== undefined) set('tokens_out', patch.tokensOut)
    if (patch.costUsd !== undefined) set('cost_usd', patch.costUsd)
    if (patch.idempotencyKey !== undefined) set('idempotency_key', patch.idempotencyKey)
    const rows = await this.q<any>(`update tasks set ${sets.join(', ')}, updated_at=now() where id=$1 returning *`, params)
    return toTask(rows[0])
  }
  async claimNextQueued(workerId: string, now: Date) {
    const rows = await this.q<any>(
      `with cte as (
         select id from tasks
         where status='queued' and scheduled_for <= $2 and cancelled=false
           and (locked_until is null or locked_until < $2)
         order by scheduled_for asc limit 1 for update skip locked
       )
       update tasks set status='running', attempts=attempts+1, started_at=now(),
         locked_by=$1, locked_until=now() + interval '5 minutes', updated_at=now()
       from cte where tasks.id=cte.id returning tasks.*`,
      [workerId, now.toISOString()],
    )
    return rows[0] ? toTask(rows[0]) : null
  }
  async listTasks(orgId: string, opts?: { status?: TaskStatus; employeeId?: string; limit?: number }) {
    const clauses = ['organization_id=$1']
    const params: unknown[] = [orgId]
    let i = 2
    if (opts?.status) { clauses.push(`status=$${i++}`); params.push(opts.status) }
    if (opts?.employeeId) { clauses.push(`employee_id=$${i++}`); params.push(opts.employeeId) }
    params.push(opts?.limit ?? 50)
    const rows = await this.q<any>(
      `select * from tasks where ${clauses.join(' and ')} order by created_at desc limit $${i}`,
      params,
    )
    return rows.map(toTask)
  }
  async cancelTask(orgId: string, id: string) {
    // A cancelled task must reach a terminal state immediately: claimNextQueued
    // skips cancelled rows, so leaving a queued task as 'queued' would orphan it
    // forever. A running task is finalized here too; the worker re-checks the
    // flag before it persists a result, so it can never overwrite this.
    await this.q(
      `update tasks set cancelled=true, status='cancelled',
       finished_at=coalesce(finished_at, now()), updated_at=now()
       where organization_id=$1 and id=$2 and status in ('queued','running')`,
      [orgId, id],
    )
  }

  // ---- Knowledge ----
  async listDocuments(orgId: string) {
    const rows = await this.q<any>('select * from knowledge_documents where organization_id=$1 order by created_at desc', [orgId])
    return rows.map(toDoc)
  }
  async getDocument(orgId: string, id: string) {
    const r = await this.one<any>('select * from knowledge_documents where organization_id=$1 and id=$2', [orgId, id])
    return r ? toDoc(r) : null
  }
  async createDocument(input: NewDocument) {
    const rows = await this.q<any>(
      `insert into knowledge_documents (organization_id, name, storage_path, content_type, size_bytes, created_by)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [input.orgId, input.name, input.storagePath, input.contentType, input.sizeBytes, input.createdBy],
    )
    return toDoc(rows[0])
  }
  async updateDocument(orgId: string, id: string, patch: Partial<KnowledgeDocument>) {
    const sets: string[] = []
    const params: unknown[] = [orgId, id]
    let i = 3
    const set = (col: string, val: unknown) => { sets.push(`${col}=$${i++}`); params.push(val) }
    if (patch.name !== undefined) set('name', patch.name)
    if (patch.storagePath !== undefined) set('storage_path', patch.storagePath)
    if (patch.contentType !== undefined) set('content_type', patch.contentType)
    if (patch.sizeBytes !== undefined) set('size_bytes', patch.sizeBytes)
    if (patch.status !== undefined) set('status', patch.status)
    if (patch.extractedText !== undefined) set('extracted_text', patch.extractedText)
    const sql = `update knowledge_documents set ${sets.join(', ')}, updated_at=now() where organization_id=$1 and id=$2 returning *`
    await this.q<any>(sql, params)
  }
  async deleteDocument(orgId: string, id: string) {
    await this.q('delete from knowledge_documents where organization_id=$1 and id=$2', [orgId, id])
  }

  // ---- Memory ----
  async listMemory(orgId: string, opts?: { employeeId?: string | null; topic?: string }) {
    const clauses = ['organization_id=$1']
    const params: unknown[] = [orgId]
    let i = 2
    if (opts?.employeeId !== undefined) { clauses.push(`employee_id is not distinct from $${i++}`); params.push(opts.employeeId) }
    if (opts?.topic) { clauses.push(`topic=$${i++}`); params.push(opts.topic) }
    const rows = await this.q<any>(`select * from memory_items where ${clauses.join(' and ')} order by created_at desc`, params)
    return rows.map(toMemory)
  }
  async addMemory(input: { orgId: string; employeeId: string | null; topic: string; text: string; meta?: Record<string, unknown> }) {
    const rows = await this.q<any>(
      `insert into memory_items (organization_id, employee_id, topic, text, meta) values ($1,$2,$3,$4,$5::jsonb) returning *`,
      [input.orgId, input.employeeId, input.topic, input.text, JSON.stringify(input.meta ?? {})],
    )
    return toMemory(rows[0])
  }
  async deleteMemory(orgId: string, id: string) {
    await this.q('delete from memory_items where organization_id=$1 and id=$2', [orgId, id])
  }

  // ---- Usage ----
  async recordUsage(input: Omit<UsageEvent, 'id' | 'createdAt'>) {
    const rows = await this.q<any>(
      `insert into usage_events (organization_id, user_id, employee_id, task_id, provider, model, tokens_in, tokens_out, cost_usd, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [input.organizationId, input.userId, input.employeeId, input.taskId, input.provider, input.model,
       input.tokensIn, input.tokensOut, input.costUsd, input.status],
    )
    return toUsage(rows[0])
  }
  async sumUsage(orgId: string, since: Date) {
    const rows = await this.q<any>(
      `select coalesce(sum(tokens_in),0) as ti, coalesce(sum(tokens_out),0) as to_, coalesce(sum(cost_usd),0) as c
       from usage_events where organization_id=$1 and created_at >= $2`,
      [orgId, since.toISOString()],
    )
    const r = rows[0]
    return { tokensIn: Number(r.ti), tokensOut: Number(r.to_), costUsd: Number(r.c) }
  }
  async sumUsageByEmployee(orgId: string, since: Date) {
    const rows = await this.q<any>(
      `select employee_id, coalesce(sum(tokens_in),0) as ti, coalesce(sum(tokens_out),0) as to_, coalesce(sum(cost_usd),0) as c
       from usage_events where organization_id=$1 and created_at >= $2 group by employee_id`,
      [orgId, since.toISOString()],
    )
    return rows.map((r: any) => ({
      employeeId: r.employee_id, tokensIn: Number(r.ti), tokensOut: Number(r.to_), costUsd: Number(r.c),
    }))
  }

  // ---- Audit ----
  async writeAudit(input: Omit<AuditLog, 'id' | 'createdAt'>) {
    await this.q(
      `insert into audit_logs (organization_id, actor_id, action, target_type, target_id, metadata)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [input.organizationId, input.actorId, input.action, input.targetType, input.targetId, JSON.stringify(input.metadata ?? {})],
    )
  }
  async auditExists(targetType: string, targetId: string): Promise<boolean> {
    const r = await this.one<any>('select 1 from audit_logs where target_type=$1 and target_id=$2 limit 1', [targetType, targetId])
    return !!r
  }

  // ---- Local credentials ----
  async createCredential(input: { userId: string; email: string; passwordHash: string }) {
    await this.q(
      `insert into auth_credentials (user_id, email, password_hash) values ($1,$2,$3)
       on conflict (user_id) do update set email=excluded.email, password_hash=excluded.password_hash`,
      [input.userId, input.email, input.passwordHash],
    )
  }
  async getCredentialByEmail(email: string) {
    const r = await this.one<any>('select user_id, password_hash from auth_credentials where email=$1', [email.toLowerCase()])
    return r ? { userId: r.user_id, passwordHash: r.password_hash } : null
  }
}

// Singleton across hot reloads.
const g = globalThis as unknown as { __localDb?: Promise<PGlite> }
function localDb(): Promise<PGlite> {
  if (!g.__localDb) {
    g.__localDb = (async () => {
      // In-memory by default; PGLITE_DIR persists to disk when set.
      const dir = process.env.PGLITE_DIR && process.env.PGLITE_DIR.length > 0 ? process.env.PGLITE_DIR : undefined
      const pg = new PGlite(dir)
      // INIT_SQL is written to be safe to re-run, so an existing on-disk
      // database (PGLITE_DIR) is reused rather than re-created.
      await pg.exec(INIT_SQL)
      return pg
    })().catch((err) => {
      // Never cache a failed initialization: a transient failure (e.g. a lock
      // held by a dying process) must not brick every later request.
      g.__localDb = undefined
      throw err
    })
  }
  return g.__localDb
}

export async function createLocalRepos(): Promise<LocalRepos> {
  return new LocalRepos(await localDb())
}

/** Reset the local database (tests only). */
export async function _resetLocalDb() {
  const pg = await localDb()
  await pg.exec(`
    drop schema public cascade; create schema public;
  `)
  await pg.exec(INIT_SQL)
}

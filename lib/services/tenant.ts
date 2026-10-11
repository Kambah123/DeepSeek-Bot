/**
 * Tenant-scoped service operations. Every function takes a verified AuthContext
 * (resolved by lib/services/authorization) and only ever touches rows belonging
 * to that organization. This is the application-layer enforcement that backs the
 * RLS policies.
 */
import type { Repos } from '../db/repos'
import type { AuthContext, AiEmployee, Conversation, Task, Plan } from '../types'
import { getPlan, PLANS } from '../billing/plans'
import { assertQuota, getUsageSummary, withOrgMutex, type UsageSummary } from '../quota/quota'
import { getStorage } from '../storage'
import { validateEmail } from '../auth/core'
import {
  NotFoundError, ValidationError, RateLimitError, ConflictError, ForbiddenError,
} from '../errors'

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org'
  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

// ---- Onboarding -----------------------------------------------------------
export async function createOrganizationForUser(
  repos: Repos,
  input: { userId: string; email: string; fullName?: string | null; orgName: string },
): Promise<{ organizationId: string }> {
  if (!input.orgName || input.orgName.trim().length < 2) throw new ValidationError('Organization name is required')
  const org = await repos.createOrganization({ name: input.orgName.trim(), slug: slugify(input.orgName) })
  await repos.addMember({ orgId: org.id, userId: input.userId, role: 'owner' })
  await repos.upsertSubscription({ organizationId: org.id, plan: 'free', status: 'trialing',
    currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString() })
  await repos.writeAudit({ organizationId: org.id, actorId: input.userId, action: 'organization.created',
    targetType: 'organization', targetId: org.id, metadata: { name: org.name } })
  return { organizationId: org.id }
}

// ---- Employees ------------------------------------------------------------
export async function listEmployees(repos: Repos, ctx: AuthContext): Promise<AiEmployee[]> {
  return repos.listEmployees(ctx.organizationId)
}

export async function getEmployee(repos: Repos, ctx: AuthContext, id: string): Promise<AiEmployee> {
  const e = await repos.getEmployee(ctx.organizationId, id)
  if (!e) throw new NotFoundError('Employee not found')
  return e
}

export async function createEmployee(
  repos: Repos, ctx: AuthContext,
  input: { template: string; name: string; role?: string; instructions?: string; model?: string },
): Promise<AiEmployee> {
  const org = await repos.getOrganization(ctx.organizationId)
  if (!org) throw new NotFoundError('Organization not found')
  const plan = getPlan(org.plan)
  const existing = await repos.listEmployees(ctx.organizationId)
  if (existing.length >= plan.maxEmployees) {
    throw new RateLimitError(`Your plan allows up to ${plan.maxEmployees} employees. Upgrade to add more.`)
  }
  // Resolve the template (reuse existing design) or a blank one.
  const { EMPLOYEE_TEMPLATES, getTemplate } = await import('../agents/templates')
  const tpl = getTemplate(input.template)
  const baseModel = input.model || tpl?.defaultModel || plan.allowedModels[0]
  if (!plan.allowedModels.includes(baseModel)) {
    throw new ValidationError(`Model "${baseModel}" is not available on the ${plan.name} plan.`)
  }
  const emp = await repos.createEmployee({
    orgId: ctx.organizationId,
    name: input.name.trim().slice(0, 40) || tpl?.name || 'New Employee',
    role: (input.role || tpl?.role || '').slice(0, 24),
    template: tpl?.id ?? input.template,
    instructions: input.instructions ?? tpl?.defaultInstructions ?? '',
    model: baseModel,
    toolPolicy: tpl?.defaultToolPolicy ?? { allow: [] },
    limits: tpl?.defaultLimits ?? {},
    createdBy: ctx.userId,
  })
  await repos.writeAudit({ organizationId: ctx.organizationId, actorId: ctx.userId, action: 'employee.created',
    targetType: 'ai_employee', targetId: emp.id, metadata: { name: emp.name } })
  return emp
}

export async function updateEmployee(
  repos: Repos, ctx: AuthContext, id: string,
  patch: { name?: string; role?: string; instructions?: string; model?: string; toolPolicy?: AiEmployee['toolPolicy']; limits?: AiEmployee['limits']; status?: 'active' | 'paused' },
): Promise<AiEmployee> {
  const existing = await repos.getEmployee(ctx.organizationId, id)
  if (!existing) throw new NotFoundError('Employee not found')
  const org = await repos.getOrganization(ctx.organizationId)
  if (patch.model && org && !getPlan(org.plan).allowedModels.includes(patch.model)) {
    throw new ValidationError(`Model "${patch.model}" is not available on this plan.`)
  }
  const updated = await repos.updateEmployee(ctx.organizationId, id, patch)
  await repos.writeAudit({ organizationId: ctx.organizationId, actorId: ctx.userId, action: 'employee.updated',
    targetType: 'ai_employee', targetId: id, metadata: {} })
  return updated
}

export async function deleteEmployee(repos: Repos, ctx: AuthContext, id: string): Promise<void> {
  const existing = await repos.getEmployee(ctx.organizationId, id)
  if (!existing) throw new NotFoundError('Employee not found')
  await repos.deleteEmployee(ctx.organizationId, id)
  await repos.writeAudit({ organizationId: ctx.organizationId, actorId: ctx.userId, action: 'employee.deleted',
    targetType: 'ai_employee', targetId: id, metadata: {} })
}

// ---- Conversations ---------------------------------------------------------
export async function listConversations(repos: Repos, ctx: AuthContext, employeeId?: string): Promise<Conversation[]> {
  return repos.listConversations(ctx.organizationId, employeeId ? { employeeId } : undefined)
}
export async function getConversation(repos: Repos, ctx: AuthContext, id: string): Promise<Conversation> {
  const c = await repos.getConversation(ctx.organizationId, id)
  if (!c) throw new NotFoundError('Conversation not found')
  return c
}
export async function listMessages(repos: Repos, ctx: AuthContext, conversationId: string) {
  const c = await repos.getConversation(ctx.organizationId, conversationId)
  if (!c) throw new NotFoundError('Conversation not found')
  return repos.listMessages(ctx.organizationId, conversationId)
}

// ---- Tasks ----------------------------------------------------------------
export interface CreateTaskInput {
  employeeId: string
  message: string
  conversationId?: string | null
  idempotencyKey?: string | null
}

export async function createTask(
  repos: Repos, ctx: AuthContext, input: CreateTaskInput,
): Promise<Task> {
  if (!input.message || input.message.trim().length === 0) throw new ValidationError('A task message is required')
  // Employee must belong to the org.
  if (input.employeeId) {
    const e = await repos.getEmployee(ctx.organizationId, input.employeeId)
    if (!e) throw new NotFoundError('Employee not found')
  }
  // Idempotency: a repeated submit with the same key returns the existing task.
  if (input.idempotencyKey) {
    const existing = await repos.getTaskByIdempotencyKey(ctx.organizationId, input.idempotencyKey)
    if (existing) return existing
  }
  // Quota + persistence are serialized per organization to avoid race bypasses.
  return withOrgMutex(ctx.organizationId, async () => {
    const org = await repos.getOrganization(ctx.organizationId)
    if (!org) throw new NotFoundError('Organization not found')
    const sub = await repos.getSubscription(ctx.organizationId)
    // Pre-flight quota (optimistic cost of one small call). Enforced again mid-flight.
    await assertQuota(repos, org, sub, { estimatedTasks: 1, estimatedCostUsd: 0.01 })

    const task = await repos.createTask({
      orgId: ctx.organizationId,
      employeeId: input.employeeId ?? null,
      conversationId: input.conversationId ?? null,
      createdBy: ctx.userId,
      type: 'chat',
      input: { message: input.message },
      idempotencyKey: input.idempotencyKey ?? null,
    })
    await repos.writeAudit({ organizationId: ctx.organizationId, actorId: ctx.userId, action: 'task.created',
      targetType: 'task', targetId: task.id, metadata: { employeeId: input.employeeId } })
    return task
  })
}

export async function listTasks(repos: Repos, ctx: AuthContext, opts?: { status?: Task['status']; employeeId?: string }): Promise<Task[]> {
  return repos.listTasks(ctx.organizationId, opts)
}
export async function getTask(repos: Repos, ctx: AuthContext, id: string): Promise<Task> {
  const t = await repos.getTask(id)
  if (!t || t.organizationId !== ctx.organizationId) throw new NotFoundError('Task not found')
  return t
}
export async function cancelTask(repos: Repos, ctx: AuthContext, id: string): Promise<void> {
  const t = await getTask(repos, ctx, id)
  if (t.status === 'completed' || t.status === 'failed') throw new ConflictError('Task already finished')
  await repos.cancelTask(ctx.organizationId, id)
  await repos.writeAudit({ organizationId: ctx.organizationId, actorId: ctx.userId, action: 'task.cancelled',
    targetType: 'task', targetId: id, metadata: {} })
}

// ---- Knowledge -------------------------------------------------------------
export async function listDocuments(repos: Repos, ctx: AuthContext) {
  return repos.listDocuments(ctx.organizationId)
}
export async function getDocument(repos: Repos, ctx: AuthContext, id: string) {
  const d = await repos.getDocument(ctx.organizationId, id)
  if (!d) throw new NotFoundError('Document not found')
  return d
}
export async function createDocumentRecord(
  repos: Repos, ctx: AuthContext, input: { name: string; contentType: string; sizeBytes: number; storagePath: string },
) {
  const doc = await repos.createDocument({
    orgId: ctx.organizationId, name: input.name, storagePath: input.storagePath,
    contentType: input.contentType, sizeBytes: input.sizeBytes, createdBy: ctx.userId,
  })
  await repos.writeAudit({ organizationId: ctx.organizationId, actorId: ctx.userId, action: 'knowledge.uploaded',
    targetType: 'knowledge_document', targetId: doc.id, metadata: { name: input.name } })
  return doc
}
export async function deleteDocument(repos: Repos, ctx: AuthContext, id: string): Promise<void> {
  const d = await getDocument(repos, ctx, id)
  const storage = getStorage()
  await storage.delete(d.storagePath).catch(() => {})
  await repos.deleteDocument(ctx.organizationId, id)
}

// ---- Usage & billing -------------------------------------------------------
export async function usageSummary(repos: Repos, ctx: AuthContext): Promise<UsageSummary & { plan: Plan }> {
  const org = await repos.getOrganization(ctx.organizationId)
  const sub = await repos.getSubscription(ctx.organizationId)
  const summary = await getUsageSummary(repos, org!, sub)
  return { ...summary, plan: org!.plan }
}

export function planCatalog() {
  return PLANS
}

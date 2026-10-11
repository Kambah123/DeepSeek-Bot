/**
 * Supabase repository (production). Uses the service-role client server-side; the
 * same org_id scoping the local store applies is passed on every query, and the
 * 0002_rls.sql policies provide defense-in-depth for any request that reaches
 * PostgREST with a user token. Created lazily so local/test code never loads it.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config'
import type {
  AiEmployee, AuditLog, Conversation, KnowledgeDocument, MemberRole, Message,
  Organization, OrganizationMember, Plan, Profile, SubStatus, Subscription,
  Task, TaskStatus, UsageEvent, MemoryItem,
} from '../types'
import type { NewDocument, NewEmployee, NewTask, Repos } from './repos'

function client(): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const T = {
  toProfile: (r: any): Profile => ({ id: r.id, email: r.email, fullName: r.full_name ?? null, createdAt: r.created_at, updatedAt: r.updated_at }),
  toOrg: (r: any): Organization => ({ id: r.id, name: r.name, slug: r.slug, plan: r.plan, spendLimitUsd: Number(r.spend_limit_usd), createdAt: r.created_at, updatedAt: r.updated_at }),
  toMember: (r: any): OrganizationMember => ({ organizationId: r.organization_id, userId: r.user_id, role: r.role, createdAt: r.created_at }),
  toSub: (r: any): Subscription => ({ id: r.id, organizationId: r.organization_id, plan: r.plan, status: r.status, provider: r.provider, providerSubscriptionId: r.provider_subscription_id ?? null, providerCustomerId: r.provider_customer_id ?? null, currentPeriodStart: r.current_period_start ?? null, currentPeriodEnd: r.current_period_end ?? null, cancelAtPeriodEnd: r.cancel_at_period_end, createdAt: r.created_at, updatedAt: r.updated_at }),
  toEmployee: (r: any): AiEmployee => ({ id: r.id, organizationId: r.organization_id, name: r.name, role: r.role, template: r.template, instructions: r.instructions, model: r.model, toolPolicy: r.tool_policy, limits: r.limits ?? {}, status: r.status, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at }),
  toConversation: (r: any): Conversation => ({ id: r.id, organizationId: r.organization_id, employeeId: r.employee_id ?? null, title: r.title, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at }),
  toMessage: (r: any): Message => ({ id: r.id, conversationId: r.conversation_id, organizationId: r.organization_id, role: r.role, content: r.content, toolCalls: r.tool_calls, toolCallId: r.tool_call_id ?? null, createdAt: r.created_at }),
  toTask: (r: any): Task => ({ id: r.id, organizationId: r.organization_id, employeeId: r.employee_id ?? null, conversationId: r.conversation_id ?? null, createdBy: r.created_by ?? null, type: r.type, status: r.status, input: r.input ?? {}, output: r.output ?? null, error: r.error ?? null, attempts: r.attempts, maxAttempts: r.max_attempts, idempotencyKey: r.idempotency_key ?? null, cancelled: r.cancelled, lockedBy: r.locked_by ?? null, lockedUntil: r.locked_until ?? null, scheduledFor: r.scheduled_for, startedAt: r.started_at ?? null, finishedAt: r.finished_at ?? null, durationMs: r.duration_ms ?? null, tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: Number(r.cost_usd), createdAt: r.created_at, updatedAt: r.updated_at }),
  toDoc: (r: any): KnowledgeDocument => ({ id: r.id, organizationId: r.organization_id, name: r.name, storagePath: r.storage_path, contentType: r.content_type, sizeBytes: Number(r.size_bytes), status: r.status, extractedText: r.extracted_text ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at }),
  toMemory: (r: any): MemoryItem => ({ id: r.id, organizationId: r.organization_id, employeeId: r.employee_id ?? null, topic: r.topic, text: r.text, meta: r.meta ?? {}, createdAt: r.created_at, updatedAt: r.updated_at }),
  toUsage: (r: any): UsageEvent => ({ id: r.id, organizationId: r.organization_id, userId: r.user_id ?? null, employeeId: r.employee_id ?? null, taskId: r.task_id ?? null, provider: r.provider, model: r.model, tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: Number(r.cost_usd), status: r.status, createdAt: r.created_at }),
}

export class SupabaseRepos implements Repos {
  private sb = client()

  async getProfileById(id: string) { const { data } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle(); return data ? T.toProfile(data) : null }
  async upsertProfile(input: { id: string; email: string; fullName?: string | null }) { const { data, error } = await this.sb.from('profiles').upsert({ id: input.id, email: input.email, full_name: input.fullName ?? null }).select().single(); if (error) throw error; return T.toProfile(data) }
  async listUserOrganizations(userId: string) { const { data } = await this.sb.from('organizations').select('*, organization_members!inner(role)').eq('organization_members.user_id', userId); return (data ?? []).map((r: any) => ({ organization: T.toOrg(r), role: r.organization_members[0].role as MemberRole })) }

  async createOrganization(input: { name: string; slug: string; plan?: Plan }) { const { data, error } = await this.sb.from('organizations').insert({ name: input.name, slug: input.slug, plan: input.plan ?? 'free' }).select().single(); if (error) throw error; return T.toOrg(data) }
  async getOrganization(id: string) { const { data } = await this.sb.from('organizations').select('*').eq('id', id).maybeSingle(); return data ? T.toOrg(data) : null }
  async updateOrganization(id: string, patch: Partial<Pick<Organization, 'name' | 'plan' | 'spendLimitUsd'>>) { const { data, error } = await this.sb.from('organizations').update({ name: patch.name, plan: patch.plan, spend_limit_usd: patch.spendLimitUsd }).eq('id', id).select().single(); if (error) throw error; return T.toOrg(data) }
  async listMembers(orgId: string) { const { data } = await this.sb.from('organization_members').select('*').eq('organization_id', orgId); return (data ?? []).map(T.toMember) }
  async getMembership(orgId: string, userId: string) { const { data } = await this.sb.from('organization_members').select('*').eq('organization_id', orgId).eq('user_id', userId).maybeSingle(); return data ? T.toMember(data) : null }
  async addMember(input: { orgId: string; userId: string; role?: MemberRole }) { const { data, error } = await this.sb.from('organization_members').upsert({ organization_id: input.orgId, user_id: input.userId, role: input.role ?? 'member' }).select().single(); if (error) throw error; return T.toMember(data) }
  async updateMemberRole(orgId: string, userId: string, role: MemberRole) { const { error } = await this.sb.from('organization_members').update({ role }).eq('organization_id', orgId).eq('user_id', userId); if (error) throw error }
  async removeMember(orgId: string, userId: string) { const { error } = await this.sb.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId); if (error) throw error }

  async getSubscription(orgId: string) { const { data } = await this.sb.from('subscriptions').select('*').eq('organization_id', orgId).order('updated_at', { ascending: false }).limit(1).maybeSingle(); return data ? T.toSub(data) : null }
  async upsertSubscription(input: Partial<Subscription> & { organizationId: string }) { const { data, error } = await this.sb.from('subscriptions').upsert({ organization_id: input.organizationId, plan: input.plan, status: input.status, provider: input.provider, provider_subscription_id: input.providerSubscriptionId, provider_customer_id: input.providerCustomerId, current_period_start: input.currentPeriodStart, current_period_end: input.currentPeriodEnd, cancel_at_period_end: input.cancelAtPeriodEnd }, { onConflict: 'organization_id,provider' }).select().single(); if (error) throw error; return T.toSub(data) }

  async listEmployees(orgId: string) { const { data } = await this.sb.from('ai_employees').select('*').eq('organization_id', orgId); return (data ?? []).map(T.toEmployee) }
  async getEmployee(orgId: string, id: string) { const { data } = await this.sb.from('ai_employees').select('*').eq('organization_id', orgId).eq('id', id).maybeSingle(); return data ? T.toEmployee(data) : null }
  async createEmployee(input: NewEmployee) { const { data, error } = await this.sb.from('ai_employees').insert({ organization_id: input.orgId, name: input.name, role: input.role, template: input.template, instructions: input.instructions, model: input.model, tool_policy: input.toolPolicy, limits: input.limits, created_by: input.createdBy }).select().single(); if (error) throw error; return T.toEmployee(data) }
  async updateEmployee(orgId: string, id: string, patch: Partial<NewEmployee>) { const { data, error } = await this.sb.from('ai_employees').update({ name: patch.name, role: patch.role, template: patch.template, instructions: patch.instructions, model: patch.model, tool_policy: patch.toolPolicy, limits: patch.limits }).eq('organization_id', orgId).eq('id', id).select().single(); if (error) throw error; return T.toEmployee(data) }
  async deleteEmployee(orgId: string, id: string) { const { error } = await this.sb.from('ai_employees').delete().eq('organization_id', orgId).eq('id', id); if (error) throw error }

  async listConversations(orgId: string, opts?: { employeeId?: string }) { let q = this.sb.from('conversations').select('*').eq('organization_id', orgId); if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId); const { data } = await q.order('updated_at', { ascending: false }); return (data ?? []).map(T.toConversation) }
  async getConversation(orgId: string, id: string) { const { data } = await this.sb.from('conversations').select('*').eq('organization_id', orgId).eq('id', id).maybeSingle(); return data ? T.toConversation(data) : null }
  async createConversation(input: { orgId: string; employeeId: string | null; title?: string; createdBy: string | null }) { const { data, error } = await this.sb.from('conversations').insert({ organization_id: input.orgId, employee_id: input.employeeId, title: input.title ?? 'New conversation', created_by: input.createdBy }).select().single(); if (error) throw error; return T.toConversation(data) }
  async renameConversation(orgId: string, id: string, title: string) { const { error } = await this.sb.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('organization_id', orgId).eq('id', id); if (error) throw error }
  async listMessages(orgId: string, conversationId: string) { const { data } = await this.sb.from('messages').select('*').eq('organization_id', orgId).eq('conversation_id', conversationId).order('created_at', { ascending: true }); return (data ?? []).map(T.toMessage) }
  async addMessage(input: { conversationId: string; orgId: string; role: Message['role']; content: string; toolCalls?: unknown; toolCallId?: string | null }) { const { data, error } = await this.sb.from('messages').insert({ conversation_id: input.conversationId, organization_id: input.orgId, role: input.role, content: input.content, tool_calls: input.toolCalls ?? null, tool_call_id: input.toolCallId ?? null }).select().single(); if (error) throw error; return T.toMessage(data) }

  async createTask(input: NewTask) { const { data, error } = await this.sb.from('tasks').insert({ organization_id: input.orgId, employee_id: input.employeeId, conversation_id: input.conversationId, created_by: input.createdBy, type: input.type, input: input.input, idempotency_key: input.idempotencyKey ?? null, max_attempts: input.maxAttempts ?? 3 }).select().single(); if (error) throw error; return T.toTask(data) }
  async getTask(id: string) { const { data } = await this.sb.from('tasks').select('*').eq('id', id).maybeSingle(); return data ? T.toTask(data) : null }
  async getTaskByIdempotencyKey(orgId: string, key: string) { const { data } = await this.sb.from('tasks').select('*').eq('organization_id', orgId).eq('idempotency_key', key).maybeSingle(); return data ? T.toTask(data) : null }
  async updateTask(id: string, patch: Partial<Task>) { const { data, error } = await this.sb.from('tasks').update({ status: patch.status, output: patch.output, error: patch.error, attempts: patch.attempts, max_attempts: patch.maxAttempts, cancelled: patch.cancelled, locked_by: patch.lockedBy, locked_until: patch.lockedUntil, started_at: patch.startedAt, finished_at: patch.finishedAt, duration_ms: patch.durationMs, tokens_in: patch.tokensIn, tokens_out: patch.tokensOut, cost_usd: patch.costUsd, idempotency_key: patch.idempotencyKey }).eq('id', id).select().single(); if (error) throw error; return T.toTask(data) }
  async claimNextQueued(workerId: string, now: Date) { const { data, error } = await this.sb.rpc('claim_next_task', { worker: workerId, now_ts: now.toISOString() }); if (error) throw error; return data && data.length ? T.toTask(data[0]) : null }
  async listTasks(orgId: string, opts?: { status?: TaskStatus; employeeId?: string; limit?: number }) { let q = this.sb.from('tasks').select('*').eq('organization_id', orgId); if (opts?.status) q = q.eq('status', opts.status); if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId); const { data } = await q.order('created_at', { ascending: false }).limit(opts?.limit ?? 50); return (data ?? []).map(T.toTask) }
  async cancelTask(orgId: string, id: string) { const { error } = await this.sb.from('tasks').update({ cancelled: true, status: 'cancelled', finished_at: new Date().toISOString() }).eq('organization_id', orgId).eq('id', id).in('status', ['queued', 'running']); if (error) throw error }

  async listDocuments(orgId: string) { const { data } = await this.sb.from('knowledge_documents').select('*').eq('organization_id', orgId); return (data ?? []).map(T.toDoc) }
  async getDocument(orgId: string, id: string) { const { data } = await this.sb.from('knowledge_documents').select('*').eq('organization_id', orgId).eq('id', id).maybeSingle(); return data ? T.toDoc(data) : null }
  async createDocument(input: NewDocument) { const { data, error } = await this.sb.from('knowledge_documents').insert({ organization_id: input.orgId, name: input.name, storage_path: input.storagePath, content_type: input.contentType, size_bytes: input.sizeBytes, created_by: input.createdBy }).select().single(); if (error) throw error; return T.toDoc(data) }
  async updateDocument(orgId: string, id: string, patch: Partial<KnowledgeDocument>) { const { error } = await this.sb.from('knowledge_documents').update({ name: patch.name, storage_path: patch.storagePath, content_type: patch.contentType, size_bytes: patch.sizeBytes, status: patch.status, extracted_text: patch.extractedText }).eq('organization_id', orgId).eq('id', id); if (error) throw error }
  async deleteDocument(orgId: string, id: string) { const { error } = await this.sb.from('knowledge_documents').delete().eq('organization_id', orgId).eq('id', id); if (error) throw error }

  async listMemory(orgId: string, opts?: { employeeId?: string | null; topic?: string }) { let q = this.sb.from('memory_items').select('*').eq('organization_id', orgId); if (opts?.employeeId !== undefined) q = q.is('employee_id', opts.employeeId); if (opts?.topic) q = q.eq('topic', opts.topic); const { data } = await q.order('created_at', { ascending: false }); return (data ?? []).map(T.toMemory) }
  async addMemory(input: { orgId: string; employeeId: string | null; topic: string; text: string; meta?: Record<string, unknown> }) { const { data, error } = await this.sb.from('memory_items').insert({ organization_id: input.orgId, employee_id: input.employeeId, topic: input.topic, text: input.text, meta: input.meta ?? {} }).select().single(); if (error) throw error; return T.toMemory(data) }
  async deleteMemory(orgId: string, id: string) { const { error } = await this.sb.from('memory_items').delete().eq('organization_id', orgId).eq('id', id); if (error) throw error }

  async recordUsage(input: Omit<UsageEvent, 'id' | 'createdAt'>) { const { data, error } = await this.sb.from('usage_events').insert({ organization_id: input.organizationId, user_id: input.userId, employee_id: input.employeeId, task_id: input.taskId, provider: input.provider, model: input.model, tokens_in: input.tokensIn, tokens_out: input.tokensOut, cost_usd: input.costUsd, status: input.status }).select().single(); if (error) throw error; return T.toUsage(data) }
  async sumUsage(orgId: string, since: Date) { const { data, error } = await this.sb.from('usage_events').select('tokens_in,tokens_out,cost_usd').gte('created_at', since.toISOString()).eq('organization_id', orgId); if (error) throw error; const agg = (data ?? []).reduce((a: any, r: any) => ({ ti: a.ti + Number(r.tokens_in), to: a.to + Number(r.tokens_out), c: a.c + Number(r.cost_usd) }), { ti: 0, to: 0, c: 0 }); return { tokensIn: agg.ti, tokensOut: agg.to, costUsd: agg.c } }
  async sumUsageByEmployee(orgId: string, since: Date) { const { data, error } = await this.sb.from('usage_events').select('employee_id,tokens_in,tokens_out,cost_usd').gte('created_at', since.toISOString()).eq('organization_id', orgId); if (error) throw error; const map = new Map<string | null, any>(); for (const r of data ?? []) { const k = r.employee_id; const cur = map.get(k) ?? { ti: 0, to: 0, c: 0 }; map.set(k, { ti: cur.ti + Number(r.tokens_in), to: cur.to + Number(r.tokens_out), c: cur.c + Number(r.cost_usd) }) } return [...map.entries()].map(([employeeId, v]) => ({ employeeId, tokensIn: v.ti, tokensOut: v.to, costUsd: v.c })) }

  async writeAudit(input: Omit<AuditLog, 'id' | 'createdAt'>) { const { error } = await this.sb.from('audit_logs').insert({ organization_id: input.organizationId, actor_id: input.actorId, action: input.action, target_type: input.targetType, target_id: input.targetId, metadata: input.metadata ?? {} }); if (error) throw error }
  async auditExists(targetType: string, targetId: string) { const { data, error } = await this.sb.from('audit_logs').select('target_id').eq('target_type', targetType).eq('target_id', targetId).limit(1); if (error) throw error; return !!data && data.length > 0 }

  async createCredential(input: { userId: string; email: string; passwordHash: string }): Promise<void> { throw new Error('Supabase mode uses Supabase Auth; credentials are managed by Supabase.') }
  async getCredentialByEmail(_email: string): Promise<{ userId: string; passwordHash: string } | null> { throw new Error('Supabase mode uses Supabase Auth.') }
}

export async function createSupabaseRepos(): Promise<SupabaseRepos> {
  return new SupabaseRepos()
}

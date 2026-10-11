/**
 * Repository interface. The service layer depends ONLY on this interface, never
 * on a concrete backend. Two implementations exist:
 *   - LocalRepos  (pglite) — local dev / CI, fully tested.
 *   - SupabaseRepos (PostgREST) — production, RLS-enforced.
 *
 * Every tenant query is scoped by organization_id. The implementation must
 * verify membership is enforced (by RLS in Supabase, by the calling service
 * layer in local mode). Never accept a client-supplied org id as proof of access.
 */
import type {
  AiEmployee, AuditLog, Conversation, KnowledgeDocument, MemberRole, Message,
  Organization, OrganizationMember, Plan, Profile, SubStatus, Subscription,
  Task, TaskStatus, UsageEvent, MemoryItem,
} from '../types'

export interface Repos {
  // Profiles & auth
  getProfileById(id: string): Promise<Profile | null>
  upsertProfile(input: { id: string; email: string; fullName?: string | null }): Promise<Profile>
  listUserOrganizations(userId: string): Promise<{ organization: Organization; role: MemberRole }[]>

  // Organizations & members
  createOrganization(input: { name: string; slug: string; plan?: Plan }): Promise<Organization>
  getOrganization(id: string): Promise<Organization | null>
  updateOrganization(id: string, patch: Partial<Pick<Organization, 'name' | 'plan' | 'spendLimitUsd'>>): Promise<Organization>
  listMembers(orgId: string): Promise<OrganizationMember[]>
  getMembership(orgId: string, userId: string): Promise<OrganizationMember | null>
  addMember(input: { orgId: string; userId: string; role?: MemberRole }): Promise<OrganizationMember>
  updateMemberRole(orgId: string, userId: string, role: MemberRole): Promise<void>
  removeMember(orgId: string, userId: string): Promise<void>

  // Subscriptions
  getSubscription(orgId: string): Promise<Subscription | null>
  upsertSubscription(input: Partial<Subscription> & { organizationId: string }): Promise<Subscription>

  // Employees
  listEmployees(orgId: string): Promise<AiEmployee[]>
  getEmployee(orgId: string, id: string): Promise<AiEmployee | null>
  createEmployee(input: NewEmployee): Promise<AiEmployee>
  updateEmployee(orgId: string, id: string, patch: Partial<NewEmployee>): Promise<AiEmployee>
  deleteEmployee(orgId: string, id: string): Promise<void>

  // Conversations & messages
  listConversations(orgId: string, opts?: { employeeId?: string }): Promise<Conversation[]>
  getConversation(orgId: string, id: string): Promise<Conversation | null>
  createConversation(input: { orgId: string; employeeId: string | null; title?: string; createdBy: string | null }): Promise<Conversation>
  renameConversation(orgId: string, id: string, title: string): Promise<void>
  listMessages(orgId: string, conversationId: string): Promise<Message[]>
  addMessage(input: { conversationId: string; orgId: string; role: Message['role']; content: string; toolCalls?: unknown; toolCallId?: string | null }): Promise<Message>

  // Tasks (worker uses the system context, not org-scoped RLS)
  createTask(input: NewTask): Promise<Task>
  getTask(id: string): Promise<Task | null>
  getTaskByIdempotencyKey(orgId: string, key: string): Promise<Task | null>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  claimNextQueued(workerId: string, now: Date): Promise<Task | null>
  listTasks(orgId: string, opts?: { status?: TaskStatus; employeeId?: string; limit?: number }): Promise<Task[]>
  cancelTask(orgId: string, id: string): Promise<void>

  // Knowledge
  listDocuments(orgId: string): Promise<KnowledgeDocument[]>
  getDocument(orgId: string, id: string): Promise<KnowledgeDocument | null>
  createDocument(input: NewDocument): Promise<KnowledgeDocument>
  updateDocument(orgId: string, id: string, patch: Partial<KnowledgeDocument>): Promise<void>
  deleteDocument(orgId: string, id: string): Promise<void>

  // Memory (organization-scoped)
  listMemory(orgId: string, opts?: { employeeId?: string | null; topic?: string }): Promise<MemoryItem[]>
  addMemory(input: { orgId: string; employeeId: string | null; topic: string; text: string; meta?: Record<string, unknown> }): Promise<MemoryItem>
  deleteMemory(orgId: string, id: string): Promise<void>

  // Usage
  recordUsage(input: Omit<UsageEvent, 'id' | 'createdAt'>): Promise<UsageEvent>
  sumUsage(orgId: string, since: Date): Promise<{ tokensIn: number; tokensOut: number; costUsd: number }>
  sumUsageByEmployee(orgId: string, since: Date): Promise<{ employeeId: string | null; tokensIn: number; tokensOut: number; costUsd: number }[]>

  // Audit
  writeAudit(input: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void>
  auditExists(targetType: string, targetId: string): Promise<boolean>

  // Local-mode credentials (Supabase mode uses Supabase Auth instead).
  createCredential(input: { userId: string; email: string; passwordHash: string }): Promise<void>
  getCredentialByEmail(email: string): Promise<{ userId: string; passwordHash: string } | null>
}

export interface NewEmployee {
  orgId: string
  name: string
  role: string
  template: string
  instructions: string
  model: string
  toolPolicy: AiEmployee['toolPolicy']
  limits: AiEmployee['limits']
  createdBy: string | null
}

export interface NewTask {
  orgId: string
  employeeId: string | null
  conversationId: string | null
  createdBy: string | null
  type: string
  input: Record<string, unknown>
  idempotencyKey?: string | null
  maxAttempts?: number
}

export interface NewDocument {
  orgId: string
  name: string
  storagePath: string
  contentType: string
  sizeBytes: number
  createdBy: string | null
}

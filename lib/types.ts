/** Shared domain types. Kept backend-agnostic so the same shapes flow from the
 *  local (pglite) store, the Supabase store, and the API layer. */

export type Plan = 'free' | 'starter' | 'pro' | 'business'
export type MemberRole = 'owner' | 'admin' | 'member'
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type MsgRole = 'system' | 'user' | 'assistant' | 'tool'

export interface Profile {
  id: string
  email: string
  fullName: string | null
  createdAt: string
  updatedAt: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: Plan
  spendLimitUsd: number
  createdAt: string
  updatedAt: string
}

export interface OrganizationMember {
  organizationId: string
  userId: string
  role: MemberRole
  createdAt: string
}

export interface Subscription {
  id: string
  organizationId: string
  plan: Plan
  status: SubStatus
  provider: string
  providerSubscriptionId: string | null
  providerCustomerId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
  updatedAt: string
}

export interface ToolPolicy {
  /** Which tools an employee may use. An empty allow list means "none". */
  allow: string[]
}

export interface EmployeeLimits {
  maxDurationMs?: number
  maxToolCalls?: number
  maxTokensPerTask?: number
}

export interface AiEmployee {
  id: string
  organizationId: string
  name: string
  role: string
  template: string
  instructions: string
  model: string
  toolPolicy: ToolPolicy
  limits: EmployeeLimits
  status: 'active' | 'paused'
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  organizationId: string
  employeeId: string | null
  title: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  organizationId: string
  role: MsgRole
  content: string
  toolCalls: unknown | null
  toolCallId: string | null
  createdAt: string
}

export interface Task {
  id: string
  organizationId: string
  employeeId: string | null
  conversationId: string | null
  createdBy: string | null
  type: string
  status: TaskStatus
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  error: string | null
  attempts: number
  maxAttempts: number
  idempotencyKey: string | null
  cancelled: boolean
  lockedBy: string | null
  lockedUntil: string | null
  scheduledFor: string
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  tokensIn: number
  tokensOut: number
  costUsd: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument {
  id: string
  organizationId: string
  name: string
  storagePath: string
  contentType: string
  sizeBytes: number
  status: string
  extractedText: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface MemoryItem {
  id: string
  organizationId: string
  employeeId: string | null
  topic: string
  text: string
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface UsageEvent {
  id: string
  organizationId: string
  userId: string | null
  employeeId: string | null
  taskId: string | null
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  status: string
  createdAt: string
}

export interface AuditLog {
  id: string
  organizationId: string | null
  actorId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** The authenticated principal the service layer acts as. Never built from
 *  client input — resolved from the session/token server-side. */
export interface AuthContext {
  userId: string
  organizationId: string
  role: MemberRole
}

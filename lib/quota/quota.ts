/**
 * Usage accounting and quota enforcement.
 *
 * Enforced server-side in two places:
 *   1. Pre-flight — before a task is created and before each model call.
 *   2. Mid-flight — the worker re-checks after every model call and halts the
 *      task when the period budget is reached.
 *
 * Race-condition protection: a per-organization in-process mutex serializes
 * quota checks + task creation for the same org within a process (the common
 * case: one API server + one worker). For multi-process deployments, the same
 * sum is computed inside a transaction that takes FOR UPDATE on the org row
 * (see supabase/migrations SQL), so two processes cannot both pass the check.
 */
import type { Repos } from '../db/repos'
import type { Organization, Plan, Subscription, UsageEvent } from '../types'
import { getPlan, currentPeriodStart } from '../billing/plans'
import { RateLimitError, ForbiddenError } from '../errors'

// ---- per-org serialization -------------------------------------------------
const locks = new Map<string, Promise<unknown>>()
export async function withOrgMutex<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(orgId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  // keep the chain alive even if fn rejects
  locks.set(orgId, next.then(() => undefined, () => undefined))
  try {
    return await next
  } finally {
    if (locks.get(orgId) === next) locks.delete(orgId)
  }
}

export interface UsageSummary {
  periodStart: string
  tasksThisPeriod: number
  tokensIn: number
  tokensOut: number
  spendUsd: number
  spendLimitUsd: number
  tasksLimit: number
  plan: Plan
  subscriptionStatus: Subscription['status'] | null
}

export async function getUsageSummary(
  repos: Repos, org: Organization, sub: Subscription | null,
): Promise<UsageSummary> {
  const plan = getPlan(org.plan)
  const start = currentPeriodStart()
  const [usage, tasks] = await Promise.all([
    repos.sumUsage(org.id, start),
    repos.listTasks(org.id, { limit: 100000 }),
  ])
  const tasksThisPeriod = tasks.filter((t) => new Date(t.createdAt) >= start).length
  const spendLimitUsd = Math.min(org.spendLimitUsd, plan.spendLimitUsd)
  return {
    periodStart: start.toISOString(),
    tasksThisPeriod,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    spendUsd: usage.costUsd,
    spendLimitUsd,
    tasksLimit: plan.tasksPerMonth,
    plan: org.plan,
    subscriptionStatus: sub?.status ?? null,
  }
}

export function isSubscriptionUsable(sub: Subscription | null, plan: Plan): boolean {
  if (plan === 'free') return true
  if (!sub) return false
  return sub.status === 'active' || sub.status === 'trialing'
}

export interface QuotaCheck {
  ok: boolean
  code?: 'subscription' | 'tasks' | 'spend'
  message?: string
  summary: UsageSummary
}

/** Pure, synchronous decision used by tests and the service layer. */
export function decideQuota(
  summary: UsageSummary,
  sub: Subscription | null,
  estimatedCostUsd = 0,
  estimatedTasks = 0,
): QuotaCheck {
  const plan = getPlan(summary.plan)
  if (!isSubscriptionUsable(sub, summary.plan)) {
    return { ok: false, code: 'subscription', message: 'Subscription is not active. Please update your plan to continue.', summary }
  }
  if (summary.tasksThisPeriod + estimatedTasks > summary.tasksLimit) {
    return { ok: false, code: 'tasks', message: `You have reached your plan's task limit (${summary.tasksLimit}/month). Upgrade to run more tasks.`, summary }
  }
  if (summary.spendUsd + estimatedCostUsd > summary.spendLimitUsd + 1e-9) {
    return { ok: false, code: 'spend', message: `You have reached your monthly model-spend limit ($${summary.spendLimitUsd}). Upgrade or raise your limit to continue.`, summary }
  }
  return { ok: true, summary }
}

/** Throws a safe, client-presentable error when the quota is not met. */
export async function assertQuota(
  repos: Repos, org: Organization, sub: Subscription | null,
  opts: { estimatedCostUsd?: number; estimatedTasks?: number } = {},
): Promise<UsageSummary> {
  const summary = await getUsageSummary(repos, org, sub)
  const decision = decideQuota(summary, sub, opts.estimatedCostUsd, opts.estimatedTasks)
  if (!decision.ok) {
    if (decision.code === 'subscription') throw new ForbiddenError(decision.message!)
    throw new RateLimitError(decision.message!)
  }
  return summary
}

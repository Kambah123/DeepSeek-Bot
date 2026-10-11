/**
 * Centralized plan definitions. ALL pricing and limits live here — never hard-code
 * plan assumptions elsewhere. Payment providers are wired to these centrally.
 */
import type { Plan } from '../types'

export interface PlanDefinition {
  id: Plan
  name: string
  priceUsdMonthly: number
  /** Recurring-billing provider plan/price code (Paystack). Empty = handled as free. */
  providerPlanCode: string
  description: string
  maxEmployees: number
  /** Monthly task allowance (soft cap enforced server-side). */
  tasksPerMonth: number
  /** Monthly model-spend allowance in USD (soft cap; org may override lower). */
  spendLimitUsd: number
  /** Models an org on this plan may select for employees. */
  allowedModels: string[]
  includedTokensPerMonth: number
}

// Default model catalog. In production these are resolved against the gateway's
// configured provider; we keep a small, documentable list here.
export const DEFAULT_MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', provider: 'deepseek' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
] as const

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: 'free', name: 'Free Trial', priceUsdMonthly: 0, providerPlanCode: '',
    description: 'Try the platform with one employee and a small monthly allowance.',
    maxEmployees: 1, tasksPerMonth: 20, spendLimitUsd: 2, allowedModels: ['deepseek-chat', 'gpt-4o-mini'],
    includedTokensPerMonth: 50_000,
  },
  starter: {
    id: 'starter', name: 'Starter', priceUsdMonthly: 29, providerPlanCode: 'PLN_STARTER',
    description: 'For small teams getting real work done with AI employees.',
    maxEmployees: 3, tasksPerMonth: 200, spendLimitUsd: 15, allowedModels: ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini'],
    includedTokensPerMonth: 500_000,
  },
  pro: {
    id: 'pro', name: 'Pro', priceUsdMonthly: 99, providerPlanCode: 'PLN_PRO',
    description: 'For growing companies that rely on multiple AI employees daily.',
    maxEmployees: 10, tasksPerMonth: 1000, spendLimitUsd: 60, allowedModels: DEFAULT_MODELS.map((m) => m.id),
    includedTokensPerMonth: 3_000_000,
  },
  business: {
    id: 'business', name: 'Business', priceUsdMonthly: 299, providerPlanCode: 'PLN_BUSINESS',
    description: 'For organizations with many teams and higher usage.',
    maxEmployees: 50, tasksPerMonth: 5000, spendLimitUsd: 250, allowedModels: DEFAULT_MODELS.map((m) => m.id),
    includedTokensPerMonth: 15_000_000,
  },
}

export function getPlan(plan: Plan): PlanDefinition {
  return PLANS[plan] ?? PLANS.free
}

export const PLAN_ORDER: Plan[] = ['free', 'starter', 'pro', 'business']

/** Billing period start: the first day of the current UTC month. */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
}

export function periodEnd(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
}

/**
 * Centralized runtime configuration.
 *
 * Security rule: server secrets (APP_SECRET, Supabase service role, model keys,
 * billing secrets) are NEVER exported to the client. Only NEXT_PUBLIC_* values
 * reach the browser. The app fails closed when a required production secret is
 * missing — it does not start serving real traffic.
 */

function env(key: string): string | undefined {
  const v = process.env[key]
  return v === undefined || v === '' ? undefined : v
}

export type DatabaseDriver = 'local' | 'supabase'
export type ModelProvider = 'mock' | 'openai-compatible'

const isProd = process.env.NODE_ENV === 'production'

export const config = {
  appUrl: env('APP_URL') ?? 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV ?? 'development',

  database: {
    driver: (env('DATABASE_DRIVER') ?? 'local') as DatabaseDriver,
    pgliteDir: env('PGLITE_DIR') ?? '',
  },

  storage: {
    dir: env('STORAGE_DIR') ?? '.storage',
  },

  supabase: {
    url: env('NEXT_PUBLIC_SUPABASE_URL') ?? '',
    anonKey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '',
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  },

  model: {
    provider: (env('MODEL_PROVIDER') ?? 'mock') as ModelProvider,
    baseUrl: env('MODEL_GATEWAY_BASE_URL') ?? '',
    apiKey: env('MODEL_GATEWAY_API_KEY') ?? '',
    defaultModel: env('MODEL_GATEWAY_DEFAULT_MODEL') ?? '',
    requestTimeoutMs: Number(env('MODEL_REQUEST_TIMEOUT_MS') ?? 120000),
    costOverrides: parseCostOverrides(env('MODEL_COST_OVERRIDES')),
  },

  worker: {
    concurrency: Number(env('WORKER_CONCURRENCY') ?? 4),
    maxDurationMs: Number(env('TASK_MAX_DURATION_MS') ?? 600000),
    maxToolCalls: Number(env('TASK_MAX_TOOL_CALLS') ?? 30),
    pollMs: Number(env('WORKER_POLL_MS') ?? 2000),
    /**
     * Run the queue worker inside the web server process. Needed for the local
     * (pglite) driver, whose embedded database cannot be shared with a separate
     * worker process. Default: on for local, off for Supabase (use `npm run
     * worker` there).
     */
    inline: env('WORKER_INLINE') === undefined
      ? (env('DATABASE_DRIVER') ?? 'local') === 'local'
      : env('WORKER_INLINE') === 'true',
  },

  billing: {
    enabled: env('BILLING_ENABLED') === 'true',
    provider: 'paystack' as const,
    secretKey: env('PAYSTACK_SECRET_KEY') ?? '',
    publicKey: env('PAYSTACK_PUBLIC_KEY') ?? '',
    webhookSecret: env('PAYSTACK_WEBHOOK_SECRET') ?? '',
  },

  limits: {
    defaultOrgSpendLimitUsd: Number(env('DEFAULT_ORG_SPEND_LIMIT_USD') ?? 10),
  },
} as const

function parseCostOverrides(raw?: string): Record<string, { in: number; out: number }> {
  const out: Record<string, { in: number; out: number }> = {}
  if (!raw) return out
  for (const part of raw.split(',')) {
    const [model, costs] = part.split('=')
    if (!model || !costs) continue
    const [i, o] = costs.split(':')
    const inn = Number(i)
    const outn = Number(o)
    if (Number.isFinite(inn) && Number.isFinite(outn)) out[model.trim()] = { in: inn, out: outn }
  }
  return out
}

/**
 * The app secret signs local-dev session tokens. Required in production; in
 * development a fixed weak value is allowed so the app runs out of the box, but
 * it is flagged as insecure.
 */
export function getAppSecret(): string {
  const secret = env('APP_SECRET')
  if (secret) {
    if (isProd && secret === 'dev-only-insecure-change-me') {
      throw new Error('APP_SECRET must be set to a strong value in production.')
    }
    return secret
  }
  if (isProd) throw new Error('APP_SECRET is required in production.')
  return 'dev-only-insecure-change-me'
}

export function isBillingConfigured(): boolean {
  return (
    config.billing.enabled &&
    config.billing.secretKey.startsWith('sk_') &&
    config.billing.webhookSecret.length > 0
  )
}

export function isSupabaseConfigured(): boolean {
  return config.supabase.url.startsWith('http') && config.supabase.anonKey.length > 0
}

export function isModelProviderConfigured(): boolean {
  if (config.model.provider === 'mock') return true
  return config.model.baseUrl.startsWith('http') && config.model.apiKey.length > 0
}

/** Filesystem directory for local document storage. */
export const storageDir: string = config.storage.dir

/** Validate that the pieces needed to serve real traffic are present. */
export function validateProductionConfig(): string[] {
  if (!isProd) return []
  const problems: string[] = []
  try {
    getAppSecret()
  } catch (e) {
    problems.push((e as Error).message)
  }
  if (config.database.driver === 'supabase') {
    if (!config.supabase.serviceRoleKey) problems.push('SUPABASE_SERVICE_ROLE_KEY is required when DATABASE_DRIVER=supabase')
  }
  if (config.model.provider !== 'mock' && !isModelProviderConfigured()) {
    problems.push('Model provider is not fully configured (baseUrl + apiKey required).')
  }
  return problems
}

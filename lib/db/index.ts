/**
 * Repository factory. Returns the configured backend. Local/pglite is the
 * default and is fully exercised by the test suite; Supabase is the production
 * backend and is loaded lazily so local/test code never requires it.
 */
import type { Repos } from './repos'
import { config, isSupabaseConfigured } from '../config'

let cached: Promise<Repos> | null = null

export function getRepos(): Promise<Repos> {
  if (cached) return cached
  const promise: Promise<Repos> = (async () => {
    if (config.database.driver === 'supabase' && isSupabaseConfigured()) {
      const { createSupabaseRepos } = await import('./supabase')
      return createSupabaseRepos()
    }
    const { createLocalRepos } = await import('./local')
    return createLocalRepos()
  })()
  cached = promise
  return promise
}

export type { Repos } from './repos'

// Test/seed helpers (local driver only).
export { _resetLocalDb, createLocalRepos } from './local'

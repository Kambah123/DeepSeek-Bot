/**
 * Supabase server clients for Next.js (production auth path). The anon client
 * reads the session from cookies (RLS applies); the admin client uses the
 * service-role key for privileged writes (never exposed to the browser).
 */
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { config } from '../config'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component where cookies are read-only; the
          // middleware/refresh path handles writing.
        }
      },
    },
  })
}

export function createSupabaseAdminClient() {
  return createAdminClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Authentication services. No Next-specific imports here so it is unit-testable.
 *
 * - LocalAuth: used when DATABASE_DRIVER=local. Passwords are scrypt-hashed and
 *   stored in auth_credentials; the platform issues its own signed JWT.
 * - SupabaseAuth: used in production. Delegates sign-up/sign-in to Supabase Auth
 *   and reads the session from Supabase cookies. The chosen organization is kept
 *   in our own org cookie.
 *
 * The active organization and role are NEVER taken from the token; they are
 * resolved server-side from organization_members by the authorization layer.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getRepos } from '../db'
import { signSession, verifySession, SESSION_COOKIE } from './session'
import { isSupabaseConfigured, config } from '../config'
import { UnauthorizedError, ConflictError, ValidationError } from '../errors'

export interface AuthUser {
  userId: string
  email: string
}

function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  const h = scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`
}
function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = scryptSync(pw, salt, 64)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
export function validatePassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 8
}

export class LocalAuth {
  async signUp(input: { email: string; password: string; fullName?: string }): Promise<AuthUser> {
    const email = input.email.toLowerCase().trim()
    if (!validateEmail(email)) throw new ValidationError('Invalid email')
    if (!validatePassword(input.password)) throw new ValidationError('Password must be at least 8 characters')
    const repos = await getRepos()
    const existing = await repos.getCredentialByEmail(email)
    if (existing) throw new ConflictError('An account with this email already exists')
    const userId = crypto.randomUUID()
    await repos.upsertProfile({ id: userId, email, fullName: input.fullName ?? null })
    await repos.createCredential({ userId, email, passwordHash: hashPassword(input.password) })
    return { userId, email }
  }

  async signIn(input: { email: string; password: string }): Promise<AuthUser> {
    const email = input.email.toLowerCase().trim()
    const repos = await getRepos()
    const cred = await repos.getCredentialByEmail(email)
    if (!cred || !verifyPassword(input.password, cred.passwordHash)) {
      throw new UnauthorizedError('Invalid email or password')
    }
    const profile = await repos.getProfileById(cred.userId)
    return { userId: cred.userId, email: profile?.email ?? email }
  }

  async issueToken(user: AuthUser): Promise<string> {
    return signSession({ sub: user.userId, email: user.email })
  }
}

export class SupabaseAuth {
  private async client() {
    // Lazy import to avoid loading Supabase in local mode / tests.
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(config.supabase.url, config.supabase.anonKey)
  }
  async signUp(input: { email: string; password: string; fullName?: string }): Promise<AuthUser> {
    const { data, error } = await (await this.client()).auth.signUp({
      email: input.email, password: input.password,
      options: input.fullName ? { data: { full_name: input.fullName } } : undefined,
    })
    if (error || !data.user) throw new UnauthorizedError(error?.message ?? 'Sign-up failed')
    // Mirror into our profiles table via the service-role path on confirm.
    return { userId: data.user.id, email: data.user.email ?? input.email }
  }
  async signIn(input: { email: string; password: string }): Promise<AuthUser> {
    const { data, error } = await (await this.client()).auth.signInWithPassword({
      email: input.email, password: input.password,
    })
    if (error || !data.user) throw new UnauthorizedError(error?.message ?? 'Sign-in failed')
    return { userId: data.user.id, email: data.user.email ?? input.email }
  }
  async issueToken(): Promise<string> {
    throw new Error('Supabase mode issues its own session cookies; use the Supabase client.')
  }
}

export function getAuth(): LocalAuth | SupabaseAuth {
  if (config.database.driver === 'supabase' && isSupabaseConfigured()) {
    return new SupabaseAuth()
  }
  return new LocalAuth()
}

// re-export for convenience
export { verifySession, SESSION_COOKIE }

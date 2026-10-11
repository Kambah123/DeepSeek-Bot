/**
 * Next.js-aware session helpers. Reads the platform's own session + org cookies.
 * In local mode these are our signed JWT + org cookie; in Supabase mode the user
 * id still resolves from our session (set after Supabase auth). The active
 * organization is NEVER trusted from the client beyond this cookie — it is
 * re-verified against organization_members by the authorization layer.
 */
import { cookies } from 'next/headers'
import { verifySession, SESSION_COOKIE, ORG_COOKIE } from './session'

export interface NextSession {
  userId: string
  email: string
}

export async function getServerSession(): Promise<NextSession | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  const payload = await verifySession(token)
  if (!payload) return null
  return { userId: payload.sub, email: payload.email }
}

export function getActiveOrgId(): string | null {
  return cookies().get(ORG_COOKIE)?.value ?? null
}

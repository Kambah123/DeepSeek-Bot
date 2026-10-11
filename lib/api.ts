/**
 * Helpers for API route handlers: consistent JSON responses, error mapping, and
 * authenticated context resolution. These never leak internal errors or secrets.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getRepos } from './db'
import { authorize } from './services/authorization'
import type { AuthContext } from './types'
import { getServerSession, getActiveOrgId } from './auth/next'
import { toAppError, AppError } from './errors'
import { setAuthCookies, setActiveOrg } from './auth/session'

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function errorResponse(err: unknown): NextResponse {
  const e = toAppError(err)
  // Never echo raw error text/stack to clients.
  return NextResponse.json(e.toJSON(), { status: e.status })
}

/** Resolve a verified org-scoped context for the current request. */
export async function requireContext(): Promise<AuthContext> {
  const session = await getServerSession()
  if (!session) throw new AppError('Authentication required', 401, 'unauthorized')
  const orgId = getActiveOrgId()
  const repos = await getRepos()
  return authorize(repos, session.userId, orgId)
}

/** Resolve the session (may be null). */
export async function optionalSession() {
  return getServerSession()
}

export { setAuthCookies, setActiveOrg, cookies }

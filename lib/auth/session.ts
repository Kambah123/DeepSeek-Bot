/**
 * Session tokens (local-dev auth) and cookie helpers.
 *
 * In local mode the platform issues its own signed JWT (HS256) carrying the user
 * id and the selected organization. In Supabase mode the user id comes from the
 * Supabase session; the selected organization is still kept in our own cookie.
 * Provider secrets are never placed in the token. The token is stored in an
 * httpOnly, SameSite=Lax, Secure(in prod) cookie — never readable by JS.
 */
import { SignJWT, jwtVerify } from 'jose'
import { getAppSecret } from '../config'
import type { NextResponse } from 'next/server'

export const SESSION_COOKIE = 'ai_session'
export const ORG_COOKIE = 'ai_org'

export interface SessionPayload {
  sub: string
  email: string
  jti: string
}

const enc = () => new TextEncoder().encode(getAppSecret())

/** The session token carries IDENTITY ONLY. The active organization and the
 *  user's role within it are resolved server-side from organization_members and
 *  are never trusted from the (client-controlled) token or cookies. */
export async function signSession(p: { sub: string; email: string }): Promise<string> {
  const jti = crypto.randomUUID()
  return new SignJWT({ email: p.email, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(enc())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, enc())
    if (!payload.sub) return null
    return {
      sub: payload.sub as string,
      email: (payload.email as string) ?? '',
      jti: (payload.jti as string) ?? '',
    }
  } catch {
    return null
  }
}

/** Set the session + active-org cookies on an outgoing response. */
export function setAuthCookies(
  res: NextResponse,
  opts: { token: string; orgId: string | null },
): NextResponse {
  res.cookies.set(SESSION_COOKIE, opts.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  if (opts.orgId) {
    res.cookies.set(ORG_COOKIE, opts.orgId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
  }
  return res
}

export function setActiveOrg(res: NextResponse, orgId: string): NextResponse {
  res.cookies.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}

export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  res.cookies.set(ORG_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

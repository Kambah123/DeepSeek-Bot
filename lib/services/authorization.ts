/**
 * Authorization gate. This is the PRIMARY tenant-isolation boundary and is
 * verified by tests. It is never built from client input: the user id comes from
 * the verified session and the organization id from a server-side cookie; the
 * role is resolved from organization_members. Cross-organization access fails
 * here with 403 before any data is touched.
 */
import type { Repos } from '../db/repos'
import type { AuthContext } from '../types'
import { UnauthorizedError, ForbiddenError } from '../errors'

export async function authorize(
  repos: Repos,
  userId: string | null,
  orgId: string | null,
): Promise<AuthContext> {
  if (!userId) throw new UnauthorizedError('Authentication required')
  if (!orgId) throw new ForbiddenError('No active organization selected')
  const membership = await repos.getMembership(orgId, userId)
  if (!membership) {
    throw new ForbiddenError('You are not a member of this organization')
  }
  return { userId, organizationId: orgId, role: membership.role }
}

/** Admin-only gate (owner/admin). Throws 403 for plain members. */
export async function requireAdmin(ctx: AuthContext): Promise<void> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new ForbiddenError('Administrator access required')
  }
}

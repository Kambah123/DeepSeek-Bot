/**
 * Server-component page context.
 *
 * The active organization is resolved the same way the API does it: the session
 * proves *who* the user is, and membership in `organization_members` proves what
 * they may see. The org cookie is only a preference — if it points at an
 * organization the user is not a member of, it is ignored rather than trusted.
 * Unauthenticated visitors are redirected to /login instead of receiving a 500.
 */
import { redirect } from 'next/navigation'
import { getServerSession, getActiveOrgId } from '../auth/next'
import { getRepos } from '../db'
import type { Repos } from '../db/repos'
import type { AuthContext, MemberRole, Organization, Plan } from '../types'

export interface PageContext {
  repos: Repos
  ctx: AuthContext
  email: string
  organizations: { organization: Organization; role: MemberRole }[]
  plan: Plan
}

export async function requirePageContext(): Promise<PageContext> {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const repos = await getRepos()
  const memberships = await repos.listUserOrganizations(session.userId)
  // Authenticated but not in any workspace (e.g. removed from the last one).
  if (memberships.length === 0) redirect('/signup')

  const preferred = getActiveOrgId()
  const active = memberships.find((m) => m.organization.id === preferred) ?? memberships[0]
  const org = (await repos.getOrganization(active.organization.id)) ?? active.organization

  return {
    repos,
    email: session.email,
    organizations: memberships,
    plan: org.plan,
    ctx: { userId: session.userId, organizationId: org.id, role: active.role },
  }
}

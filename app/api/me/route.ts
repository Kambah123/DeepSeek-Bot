import { json, errorResponse, optionalSession } from '@/lib/api'
import { getRepos } from '@/lib/db'
import { getActiveOrgId } from '@/lib/auth/next'

export async function GET() {
  try {
    const session = await optionalSession()
    if (!session) return json({ user: null, organizations: [], activeOrganizationId: null })
    const repos = await getRepos()
    const organizations = await repos.listUserOrganizations(session.userId)
    const activeOrganizationId = getActiveOrgId()
    return json({ user: session, organizations, activeOrganizationId })
  } catch (err) {
    return errorResponse(err)
  }
}

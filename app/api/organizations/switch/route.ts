import { NextRequest } from 'next/server'
import { json, errorResponse, setActiveOrg, optionalSession } from '@/lib/api'
import { getRepos } from '@/lib/db'
import { ForbiddenError } from '@/lib/errors'

export async function POST(req: NextRequest) {
  try {
    const session = await optionalSession()
    if (!session) return json({ error: { message: 'Authentication required' } }, 401)
    const { orgId } = await req.json()
    if (!orgId) return json({ error: { message: 'orgId is required' } }, 422)
    const repos = await getRepos()
    const membership = await repos.getMembership(orgId, session.userId)
    if (!membership) throw new ForbiddenError('You are not a member of this organization')
    const res = json({ ok: true, orgId })
    setActiveOrg(res, orgId)
    return res
  } catch (err) {
    return errorResponse(err)
  }
}

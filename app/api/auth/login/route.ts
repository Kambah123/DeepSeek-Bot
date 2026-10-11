import { NextRequest } from 'next/server'
import { json, errorResponse, setAuthCookies, setActiveOrg } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { isSupabaseConfigured } from '@/lib/config'
import { LocalAuth, validateEmail } from '@/lib/auth/core'
import { getRepos } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/auth/supabase-next'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').toLowerCase().trim()
    const password = String(body.password ?? '')
    if (!validateEmail(email)) throw new AppError('Invalid email', 422, 'validation')

    if (isSupabaseConfigured()) {
      const sb = createSupabaseServerClient()
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error || !data.user) throw new AppError('Invalid email or password', 401)
      const repos = await getRepos()
      const orgs = await repos.listUserOrganizations(data.user.id)
      const orgId = orgs[0]?.organization.id ?? null
      const res = json({ userId: data.user.id, orgId })
      if (orgId) setActiveOrg(res, orgId)
      return res
    }

    const auth = new LocalAuth()
    const user = await auth.signIn({ email, password })
    const repos = await getRepos()
    const orgs = await repos.listUserOrganizations(user.userId)
    const orgId = orgs[0]?.organization.id ?? null
    const token = await auth.issueToken(user)
    const res = json({ userId: user.userId, orgId })
    setAuthCookies(res, { token, orgId })
    return res
  } catch (err) {
    return errorResponse(err)
  }
}

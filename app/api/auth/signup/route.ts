import { NextRequest } from 'next/server'
import { json, errorResponse, setAuthCookies, setActiveOrg } from '@/lib/api'
import { AppError, ValidationError } from '@/lib/errors'
import { isSupabaseConfigured } from '@/lib/config'
import { LocalAuth, validateEmail, validatePassword } from '@/lib/auth/core'
import { createOrganizationForUser } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-next'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').toLowerCase().trim()
    const password = String(body.password ?? '')
    const fullName = body.fullName ? String(body.fullName) : null
    const orgName = String(body.orgName ?? '').trim()

    if (!validateEmail(email)) throw new ValidationError('A valid email is required')
    if (!validatePassword(password)) throw new ValidationError('Password must be at least 8 characters')
    if (orgName.length < 2) throw new ValidationError('Company name is required')

    if (isSupabaseConfigured()) {
      // Production: create the Supabase auth user, then mirror into our tables
      // using the service-role client (bypasses RLS for setup).
      const sb = createSupabaseServerClient()
      const { data, error } = await sb.auth.signUp({
        email, password, options: fullName ? { data: { full_name: fullName } } : undefined,
      })
      if (error || !data.user) throw new AppError(error?.message ?? 'Sign-up failed', 400)
      const admin = createSupabaseAdminClient()
      const repos = await getRepos()
      const org = await repos.createOrganization({ name: orgName, slug: `${email.split('@')[0]}-${Math.random().toString(36).slice(2, 7)}` })
      await repos.addMember({ orgId: org.id, userId: data.user.id, role: 'owner' })
      await repos.upsertProfile({ id: data.user.id, email, fullName })
      await repos.upsertSubscription({ organizationId: org.id, plan: 'free', status: 'trialing' })
      void admin
      const res = json({ userId: data.user.id, orgId: org.id, needsConfirmation: !data.session }, 201)
      setActiveOrg(res, org.id)
      return res
    }

    // Local mode: platform-managed accounts + signed session cookie.
    const auth = new LocalAuth()
    const user = await auth.signUp({ email, password, fullName: fullName ?? undefined })
    const repos = await getRepos()
    const { organizationId } = await createOrganizationForUser(repos, { userId: user.userId, email, orgName })
    const token = await auth.issueToken(user)
    const res = json({ userId: user.userId, orgId: organizationId }, 201)
    setAuthCookies(res, { token, orgId: organizationId })
    return res
  } catch (err) {
    return errorResponse(err)
  }
}

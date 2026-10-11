import { requirePageContext } from '@/lib/server/context'
import { AppShell } from '@/components/app-shell'

/**
 * Authenticated workspace layout. requirePageContext() redirects unauthenticated
 * visitors to /login and resolves the active organization from verified
 * membership — never from the cookie alone.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { ctx, email, organizations, plan } = await requirePageContext()

  return (
    <AppShell
      email={email}
      role={ctx.role}
      plan={plan}
      activeOrgId={ctx.organizationId}
      organizations={organizations.map(({ organization }) => ({
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
      }))}
    >
      {children}
    </AppShell>
  )
}

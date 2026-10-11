import Link from 'next/link'
import { requirePageContext } from '@/lib/server/context'
import { listEmployees } from '@/lib/services/tenant'
import { EMPLOYEE_TEMPLATES } from '@/lib/agents/templates'
import { getPlan } from '@/lib/billing/plans'
import { EmployeeForm } from '@/components/employee-form'
import { PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function NewEmployeePage() {
  const { repos, ctx, plan } = await requirePageContext()
  const [employees] = await Promise.all([listEmployees(repos, ctx)])
  const definition = getPlan(plan)

  if (employees.length >= definition.maxEmployees) {
    return (
      <>
        <PageHeader title="New employee" />
        <div className="card p-6">
          <h2 className="font-medium text-ink-900">Your plan is at its employee limit</h2>
          <p className="mt-1 text-sm text-ink-600">
            The {definition.name} plan allows {definition.maxEmployees} employee{definition.maxEmployees === 1 ? '' : 's'}.
            Upgrade to add more, or pause an existing employee to free a seat.
          </p>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard/usage" className="btn-primary">
              View plans
            </Link>
            <Link href="/dashboard/employees" className="btn-secondary">
              Back to employees
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="New employee"
        description="Start from a role template. You can change every detail afterwards."
      />
      <EmployeeForm
        templates={EMPLOYEE_TEMPLATES.map((t) => ({ id: t.id, name: t.name, role: t.role, description: t.description }))}
        models={definition.allowedModels}
      />
    </>
  )
}

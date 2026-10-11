import Link from 'next/link'
import { requirePageContext } from '@/lib/server/context'
import { listEmployees, listTasks } from '@/lib/services/tenant'
import { getPlan } from '@/lib/billing/plans'
import { timeAgo, truncate } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  const { repos, ctx, plan } = await requirePageContext()
  const [employees, tasks] = await Promise.all([listEmployees(repos, ctx), listTasks(repos, ctx, {})])
  const definition = getPlan(plan)
  const atLimit = employees.length >= definition.maxEmployees

  return (
    <>
      <PageHeader
        title="AI employees"
        description={`${employees.length} of ${definition.maxEmployees} on the ${definition.name} plan`}
        action={
          atLimit ? (
            <Link href="/dashboard/usage" className="btn-secondary">
              Employee limit reached
            </Link>
          ) : (
            <Link href="/dashboard/employees/new" className="btn-primary">
              New employee
            </Link>
          )
        }
      />

      {employees.length === 0 ? (
        <EmptyState
          title="No employees yet"
          description="Create your first AI employee from a role template. They'll be ready to take on tasks immediately."
          action={
            <Link href="/dashboard/employees/new" className="btn-primary">
              Create an employee
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {employees.map((employee) => {
            const employeeTasks = tasks.filter((t) => t.employeeId === employee.id)
            const open = employeeTasks.filter((t) => t.status === 'queued' || t.status === 'running').length
            const last = employeeTasks[0]
            return (
              <Link key={employee.id} href={`/dashboard/employees/${employee.id}`} className="card p-5 transition-shadow hover:shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium text-ink-900">{employee.name}</h2>
                    <p className="mt-0.5 text-sm text-ink-600">{employee.role || employee.template}</p>
                  </div>
                  <span className={`badge ${employee.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                    {employee.status === 'active' ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-ink-600">{truncate(employee.instructions, 120)}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
                  <span>{employee.model}</span>
                  <span>
                    {employeeTasks.length} task{employeeTasks.length === 1 ? '' : 's'}
                    {open > 0 ? ` · ${open} in progress` : ''}
                    {last ? ` · last ${timeAgo(last.createdAt)}` : ''}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

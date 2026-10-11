import Link from 'next/link'
import { requirePageContext } from '@/lib/server/context'
import { listEmployees, listTasks, usageSummary, listDocuments } from '@/lib/services/tenant'
import { getPlan } from '@/lib/billing/plans'
import { usd, num, timeAgo, truncate } from '@/lib/format'
import { EmptyState, PageHeader, ProgressBar, Stat, TaskStatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function DashboardOverview() {
  const { repos, ctx, organizations } = await requirePageContext()
  const [employees, tasks, summary, documents] = await Promise.all([
    listEmployees(repos, ctx),
    listTasks(repos, ctx, {}),
    usageSummary(repos, ctx),
    listDocuments(repos, ctx),
  ])

  const plan = getPlan(summary.plan)
  const recent = tasks.slice(0, 5)
  const activeEmployees = employees.filter((e) => e.status === 'active').length
  const openTasks = tasks.filter((t) => t.status === 'queued' || t.status === 'running').length
  const workspaceName = organizations.find((o) => o.organization.id === ctx.organizationId)?.organization.name ?? 'Workspace'

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${workspaceName} · ${plan.name} plan`}
        action={
          <Link href="/dashboard/employees/new" className="btn-primary">
            New employee
          </Link>
        }
      />

      {employees.length === 0 ? (
        <EmptyState
          title="Create your first AI employee"
          description="Pick a role template — research, marketing or operations — and your employee is ready to take on real work in under a minute."
          action={
            <Link href="/dashboard/employees/new" className="btn-primary">
              Create an employee
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Employees"
              value={`${activeEmployees}/${employees.length}`}
              hint={`Plan allows ${plan.maxEmployees}`}
            />
            <Stat
              label="Tasks this month"
              value={num(summary.tasksThisPeriod)}
              hint={`${num(summary.tasksLimit)} included${openTasks ? ` · ${openTasks} in progress` : ''}`}
            />
            <Stat
              label="Model spend"
              value={usd(summary.spendUsd)}
              hint={`of ${usd(summary.spendLimitUsd)} included`}
            />
            <Stat label="Knowledge files" value={num(documents.length)} hint="Available to employees" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="card p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium text-ink-900">Recent work</h2>
                <Link href="/dashboard/tasks" className="text-sm text-brand-600 hover:underline">
                  All tasks
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="text-sm text-ink-600">
                  No tasks yet. Open an employee and assign the first piece of work.
                </p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {recent.map((task) => {
                    const employee = employees.find((e) => e.id === task.employeeId)
                    return (
                      <li key={task.id} className="py-3">
                        <Link href={`/dashboard/tasks/${task.id}`} className="block hover:opacity-80">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm text-ink-800">
                              {truncate(String((task.input as Record<string, unknown>)?.message ?? 'Task'), 90)}
                            </span>
                            <TaskStatusBadge status={task.status} />
                          </div>
                          <p className="mt-1 text-xs text-ink-500">
                            {employee ? `${employee.name} · ` : ''}
                            {timeAgo(task.createdAt)}
                            {task.costUsd > 0 ? ` · ${usd(task.costUsd)}` : ''}
                          </p>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="card space-y-5 p-6">
              <h2 className="font-medium text-ink-900">Usage this period</h2>
              <ProgressBar
                used={summary.tasksThisPeriod}
                limit={summary.tasksLimit}
                label={`Tasks · ${num(summary.tasksThisPeriod)} of ${num(summary.tasksLimit)}`}
              />
              <ProgressBar
                used={summary.spendUsd}
                limit={summary.spendLimitUsd}
                label={`Spend · ${usd(summary.spendUsd)} of ${usd(summary.spendLimitUsd)}`}
              />
              <div className="border-t border-ink-100 pt-4 text-sm text-ink-600">
                <p>
                  Tokens used: <span className="tabular-nums text-ink-800">{num(summary.tokensIn + summary.tokensOut)}</span>
                </p>
                <Link href="/dashboard/usage" className="mt-2 inline-block text-brand-600 hover:underline">
                  Usage &amp; plan details
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

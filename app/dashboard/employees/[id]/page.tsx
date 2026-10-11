import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageContext } from '@/lib/server/context'
import { getEmployee, listTasks, listDocuments } from '@/lib/services/tenant'
import { getPlan } from '@/lib/billing/plans'
import { usd, num, duration, timeAgo, dateTime } from '@/lib/format'
import { NotFoundError } from '@/lib/errors'
import { ConfirmAction } from '@/components/confirm-action'
import { EmployeeEditor } from '@/components/employee-editor'
import { TaskComposer } from '@/components/task-composer'
import { PageHeader, TaskStatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const { repos, ctx, plan } = await requirePageContext()

  let employee
  try {
    employee = await getEmployee(repos, ctx, params.id)
  } catch (err) {
    if (err instanceof NotFoundError) notFound()
    throw err
  }

  const [tasks, documents] = await Promise.all([
    listTasks(repos, ctx, { employeeId: employee.id }),
    listDocuments(repos, ctx),
  ])
  const definition = getPlan(plan)
  const usableDocs = documents.filter((d) => d.extractedText).length
  const totals = tasks.reduce(
    (acc, t) => ({ cost: acc.cost + t.costUsd, tokens: acc.tokens + t.tokensIn + t.tokensOut }),
    { cost: 0, tokens: 0 },
  )
  const isActive = employee.status === 'active'
  const paused = !isActive

  return (
    <>
      <PageHeader
        title={employee.name}
        description={`${employee.role || employee.template} · ${employee.model} · created ${timeAgo(employee.createdAt)}`}
        action={
          <div className="flex items-center gap-3">
            <Link href="/dashboard/employees" className="btn-ghost">
              Back
            </Link>
            <ConfirmAction
              url={`/api/employees/${employee.id}`}
              method="DELETE"
              label="Delete employee"
              confirmText={`Delete ${employee.name}? Its completed task history stays in the workspace.`}
              redirectTo="/dashboard/employees"
              className="btn-danger"
            />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <TaskComposer
            employeeId={employee.id}
            employeeName={employee.name}
            disabled={paused}
            disabledReason={`${employee.name} is paused. Reactivate it below to assign new work.`}
          />

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium text-ink-900">Task history</h2>
              <span className="text-xs text-ink-500">
                {tasks.length} task{tasks.length === 1 ? '' : 's'} · {usd(totals.cost)} · {num(totals.tokens)} tokens
              </span>
            </div>
            {tasks.length === 0 ? (
              <p className="text-sm text-ink-600">No tasks yet — assign the first one above.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {tasks.map((task) => (
                  <li key={task.id} className="py-3">
                    <Link href={`/dashboard/tasks/${task.id}`} className="block hover:opacity-80">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-ink-800">
                          {String((task.input as Record<string, unknown>)?.message ?? 'Task')}
                        </span>
                        <TaskStatusBadge status={task.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {timeAgo(task.createdAt)}
                        {task.durationMs !== null ? ` · ${duration(task.durationMs)}` : ''}
                        {task.costUsd > 0 ? ` · ${usd(task.costUsd)}` : ''}
                        {task.status === 'failed' && task.error ? ` · ${task.error}` : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5 text-sm">
            <h2 className="font-medium text-ink-900">Employee status</h2>
            <dl className="mt-3 space-y-2 text-ink-600">
              <div className="flex justify-between gap-3">
                <dt>Status</dt>
                <dd className={isActive ? 'text-emerald-700' : 'text-amber-700'}>{isActive ? 'Active' : 'Paused'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Model</dt>
                <dd className="text-ink-800">{employee.model}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Available on plan</dt>
                <dd className="text-ink-800">{definition.allowedModels.includes(employee.model) ? 'Yes' : 'Not on plan'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Tools</dt>
                <dd className="text-ink-800">{employee.toolPolicy.allow.length ? employee.toolPolicy.allow.join(', ') : 'None'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Knowledge in context</dt>
                <dd className="text-ink-800">{usableDocs} file{usableDocs === 1 ? '' : 's'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Created</dt>
                <dd className="text-ink-800">{dateTime(employee.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="mb-3 font-medium text-ink-900">Configuration</h2>
            <EmployeeEditor employee={employee} models={definition.allowedModels} />
          </div>
        </div>
      </div>
    </>
  )
}

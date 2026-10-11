import Link from 'next/link'
import type { TaskStatus } from '@/lib/types'
import { requirePageContext } from '@/lib/server/context'
import { listEmployees, listTasks } from '@/lib/services/tenant'
import { usd, timeAgo, truncate } from '@/lib/format'
import { AutoRefresh } from '@/components/auto-refresh'
import { EmptyState, PageHeader, TaskStatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Working' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default async function TasksPage({ searchParams }: { searchParams: { status?: string } }) {
  const { repos, ctx } = await requirePageContext()
  const filter = searchParams.status && searchParams.status !== 'all' ? (searchParams.status as TaskStatus) : undefined
  const [tasks, employees] = await Promise.all([
    listTasks(repos, ctx, filter ? { status: filter } : {}),
    listEmployees(repos, ctx),
  ])

  const pending = tasks.some((t) => t.status === 'queued' || t.status === 'running')

  return (
    <>
      <AutoRefresh active={pending} />
      <PageHeader
        title="Tasks"
        description="Every piece of work assigned to your AI employees, newest first."
        action={
          employees.length > 0 ? (
            <Link href={`/dashboard/employees/${employees[0].id}`} className="btn-primary">
              Assign a task
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (searchParams.status ?? 'all') === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'all' ? '/dashboard/tasks' : `/dashboard/tasks?status=${f.key}`}
              className={`rounded-full px-3 py-1 text-sm ${
                active ? 'bg-brand-600 text-white' : 'border border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title={filter ? `No ${filter} tasks` : 'No tasks yet'}
          description={
            filter
              ? 'Nothing matches this filter right now. Try another status.'
              : 'Assign work from an employee page and it will show up here with its deliverable.'
          }
          action={
            employees.length > 0 ? (
              <Link href={`/dashboard/employees/${employees[0].id}`} className="btn-primary">
                Assign your first task
              </Link>
            ) : (
              <Link href="/dashboard/employees/new" className="btn-primary">
                Create an employee first
              </Link>
            )
          }
        />
      ) : (
        <div className="card divide-y divide-ink-100">
          {tasks.map((task) => {
            const employee = employees.find((e) => e.id === task.employeeId)
            return (
              <Link key={task.id} href={`/dashboard/tasks/${task.id}`} className="block p-4 hover:bg-ink-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-800">
                      {truncate(String((task.input as Record<string, unknown>)?.message ?? 'Task'), 120)}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {employee ? `${employee.name} · ` : ''}
                      {timeAgo(task.createdAt)}
                      {task.tokensIn + task.tokensOut > 0 ? ` · ${task.tokensIn + task.tokensOut} tokens` : ''}
                      {task.costUsd > 0 ? ` · ${usd(task.costUsd)}` : ''}
                      {task.attempts > 1 ? ` · attempt ${task.attempts}` : ''}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

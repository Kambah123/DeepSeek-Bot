import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageContext } from '@/lib/server/context'
import { getTask, getEmployee, listMessages } from '@/lib/services/tenant'
import { usd, duration, dateTime, timeAgo } from '@/lib/format'
import { NotFoundError } from '@/lib/errors'
import { AutoRefresh } from '@/components/auto-refresh'
import { ConfirmAction } from '@/components/confirm-action'
import { Markdown } from '@/components/markdown'
import { PageHeader, TaskStatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const { repos, ctx } = await requirePageContext()

  let task
  try {
    task = await getTask(repos, ctx, params.id)
  } catch (err) {
    if (err instanceof NotFoundError) notFound()
    throw err
  }

  const employee = task.employeeId ? await repos.getEmployee(ctx.organizationId, task.employeeId) : null
  const conversationId = (task.output as Record<string, unknown> | null)?.conversationId as string | undefined
  const messages = conversationId ? await listMessages(repos, ctx, conversationId) : []

  const prompt = String((task.input as Record<string, unknown>)?.message ?? '')
  const deliverable = String((task.output as Record<string, unknown> | null)?.content ?? '')
  const pending = task.status === 'queued' || task.status === 'running'
  const assistantMessages = messages.filter((m) => m.role === 'assistant')

  return (
    <>
      <AutoRefresh active={pending} />
      <PageHeader
        title={employee ? `${employee.name} · task` : 'Task'}
        description={`Submitted ${dateTime(task.createdAt)} by the workspace`}
        action={
          <div className="flex items-center gap-3">
            <TaskStatusBadge status={task.status} />
            <Link href="/dashboard/tasks" className="btn-ghost">
              All tasks
            </Link>
            {pending && (
              <ConfirmAction
                url={`/api/tasks/${task.id}/cancel`}
                method="POST"
                label="Cancel"
                confirmText="Cancel this task? The employee will stop working on it."
                className="btn-secondary"
              />
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink-500">Request</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{prompt}</p>
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-500">Deliverable</h2>
              {task.status === 'completed' && <span className="text-xs text-ink-500">from {task.tokensOut} output tokens</span>}
            </div>

            {task.status === 'completed' && deliverable ? (
              <Markdown text={deliverable} />
            ) : task.status === 'failed' ? (
              <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">
                <p className="font-medium">This task failed.</p>
                <p className="mt-1">{task.error ?? 'The employee could not complete the work.'}</p>
                <p className="mt-2 text-rose-600">
                  The workspace quota or model provider may be the cause. You can assign the task again from the employee page.
                </p>
              </div>
            ) : task.status === 'cancelled' ? (
              <p className="text-sm text-ink-600">This task was cancelled before it produced a deliverable.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  {task.status === 'running' ? `${employee?.name ?? 'Your employee'} is working on this…` : 'Waiting for a worker to pick this up…'}
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-ink-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-ink-100" />
                  <div className="h-3 w-5/6 animate-pulse rounded bg-ink-100" />
                </div>
                <p className="text-xs text-ink-500">
                  The page refreshes automatically. Deliverables persist here once the task completes.
                </p>
              </div>
            )}
          </div>

          {assistantMessages.length > 1 && (
            <div className="card p-6">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-500">Conversation</h2>
              <ol className="space-y-4">
                {messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant')
                  .map((m) => (
                    <li key={m.id}>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                        {m.role === 'user' ? 'You' : employee?.name ?? 'Employee'} · {timeAgo(m.createdAt)}
                      </p>
                      <div className="mt-1 rounded-lg bg-ink-50 p-3">
                        <Markdown text={m.content} />
                      </div>
                    </li>
                  ))}
              </ol>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5 text-sm">
            <h2 className="font-medium text-ink-900">Run details</h2>
            <dl className="mt-3 space-y-2 text-ink-600">
              <div className="flex justify-between gap-3">
                <dt>Status</dt>
                <dd className="text-ink-800">{task.status}</dd>
              </div>
              {employee && (
                <div className="flex justify-between gap-3">
                  <dt>Employee</dt>
                  <dd className="truncate text-ink-800">
                    <Link href={`/dashboard/employees/${employee.id}`} className="text-brand-600 hover:underline">
                      {employee.name}
                    </Link>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt>Model</dt>
                <dd className="text-ink-800">{employee?.model ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Duration</dt>
                <dd className="text-ink-800">{duration(task.durationMs)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Tokens in / out</dt>
                <dd className="tabular-nums text-ink-800">
                  {task.tokensIn} / {task.tokensOut}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Model cost</dt>
                <dd className="tabular-nums text-ink-800">{usd(task.costUsd)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Attempts</dt>
                <dd className="tabular-nums text-ink-800">
                  {task.attempts} of {task.maxAttempts}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Finished</dt>
                <dd className="text-ink-800">{task.finishedAt ? dateTime(task.finishedAt) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Task id</dt>
                <dd className="truncate font-mono text-xs text-ink-500">{task.id}</dd>
              </div>
            </dl>
          </div>

          <div className="card p-5 text-sm text-ink-600">
            <h2 className="font-medium text-ink-900">How this ran</h2>
            <p className="mt-2">
              The task was queued durably, claimed by a background worker, executed through the platform&apos;s model gateway with
              this employee&apos;s instructions and approved company knowledge, then stored with its usage and cost.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

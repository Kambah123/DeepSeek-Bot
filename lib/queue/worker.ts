/**
 * Background worker. Adapted from ds-bot's "one session per worker" idea into a
 * persistent, organization-scoped job runner.
 *
 * Responsibilities:
 *  - Claim a queued task atomically (SKIP LOCKED) so duplicate deliveries never
 *    double-execute the same work.
 *  - Validate access + quota, run the employee turn through the model gateway.
 *  - Persist the REAL result (messages, task output, usage) before marking done.
 *  - Enforce max duration, tool-call and token limits; handle cancellation.
 *  - Retry with bounded attempts; mark failed only after retries are exhausted.
 *
 * The worker never trusts the gateway for success: a task is marked `completed`
 * only after its result has been written to the database.
 */
import type { Repos } from '../db/repos'
import type { Task } from '../types'
import type { ModelGateway } from '../gateway/gateway'
import { getModelGateway } from '../gateway/gateway'
import { buildSystemPrompt } from '../agents/templates'
import { runTurn, buildSystemContext } from '../agents/runtime'
import type { ChatMessage } from '../gateway/gateway'
import { getPlan, currentPeriodStart } from '../billing/plans'
import { assertQuota, getUsageSummary } from '../quota/quota'
import { config } from '../config'
import { GatewayError } from '../errors'

export class Worker {
  constructor(
    private repos: Repos,
    private gateway: ModelGateway = getModelGateway(),
    private workerId = `worker-${Math.random().toString(36).slice(2, 10)}`,
  ) {}

  /** Claim and run one task. Returns true if a task was processed. */
  async tick(): Promise<boolean> {
    const task = await this.repos.claimNextQueued(this.workerId, new Date())
    if (!task) return false
    try {
      await this.runTask(task)
    } catch (err) {
      await this.failTask(task, err as Error)
    }
    return true
  }

  private async runTask(task: Task): Promise<void> {
    if (task.cancelled) {
      await this.repos.updateTask(task.id, { status: 'cancelled', finishedAt: new Date().toISOString() })
      return
    }
    // Load the employee (org-scoped) — proves ownership before any work.
    const employee = task.employeeId ? await this.repos.getEmployee(task.organizationId, task.employeeId) : null
    const org = await this.repos.getOrganization(task.organizationId)
    const sub = await this.repos.getSubscription(task.organizationId)
    if (!org) throw new Error('Organization missing')
    // Mid-flight quota check (budget may have changed since enqueue).
    await assertQuota(this.repos, org, sub)

    // Conversation: reuse the task's, or create one.
    let conversationId = task.conversationId
    const userMessage = String((task.input as any)?.message ?? '')
    if (!conversationId) {
      const conv = await this.repos.createConversation({
        orgId: task.organizationId, employeeId: task.employeeId, title: userMessage.slice(0, 80) || 'Task', createdBy: task.createdBy,
      })
      conversationId = conv.id
    }
    const conv = await this.repos.getConversation(task.organizationId, conversationId)
    if (!conv) throw new Error('Conversation missing')

    // History (prior assistant/user turns), excluding the new user message.
    const historyRows = await this.repos.listMessages(task.organizationId, conversationId)
    const history: ChatMessage[] = historyRows.map((m) => ({ role: m.role, content: m.content, toolCalls: m.toolCalls as any }))

    // Persist the inbound user message.
    await this.repos.addMessage({ conversationId, orgId: task.organizationId, role: 'user', content: userMessage })

    // Approved knowledge + memory context (organization-scoped, never cross-org).
    const knowledgeText = await this.retrieveContext(task.organizationId, task.employeeId)
    const systemPrompt = employee
      ? buildSystemContext(buildSystemPrompt(employee), knowledgeText, '')
      : buildSystemContext('# You are a helpful company assistant.\nYou are employed by a company on the AI Employees platform.', knowledgeText, '')

    // Accumulate usage for per-call accounting.
    const usageAccum: { tokensIn: number; tokensOut: number; costUsd: number; model: string; provider: string }[] = []
    const limits = employee?.limits ?? {}
    const maxToolCalls = limits.maxToolCalls ?? config.worker.maxToolCalls
    const maxDurationMs = limits.maxDurationMs ?? config.worker.maxDurationMs

    const turn = await this.withTimeout(
      runTurn(
        {
          gateway: this.gateway,
          executeTool: async () => 'Tool not available in this environment.',
          maxToolCalls,
          maxTokens: limits.maxTokensPerTask,
          onUsage: (res) => usageAccum.push({ tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd, model: res.model, provider: res.provider }),
          shouldAbort: async () => {
            const fresh = await this.repos.getTask(task.id)
            return !fresh || fresh.cancelled
          },
        },
        systemPrompt,
        history,
        userMessage,
      ),
      maxDurationMs,
    )

    if (!turn.content || turn.content === 'TASK_CANCELLED') {
      throw new Error('TASK_CANCELLED')
    }

    // Persist the REAL assistant message + task result.
    await this.repos.addMessage({ conversationId, orgId: task.organizationId, role: 'assistant', content: turn.content })

    const tokensIn = usageAccum.reduce((a, u) => a + u.tokensIn, 0)
    const tokensOut = usageAccum.reduce((a, u) => a + u.tokensOut, 0)
    const costUsd = Number(usageAccum.reduce((a, u) => a + u.costUsd, 0).toFixed(6))

    await this.repos.updateTask(task.id, {
      status: 'completed',
      output: { content: turn.content, conversationId, toolCalls: turn.toolCalls },
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(task.startedAt ?? Date.now()).getTime(),
      tokensIn, tokensOut, costUsd,
    })
    await this.repos.renameConversation(task.organizationId, conversationId, userMessage.slice(0, 60) || conv.title)

    // Record usage events (one per model call) for accounting + billing.
    for (const u of usageAccum) {
      await this.repos.recordUsage({
        organizationId: task.organizationId, userId: task.createdBy, employeeId: task.employeeId, taskId: task.id,
        provider: u.provider, model: u.model, tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: u.costUsd, status: 'ok',
      })
    }
    await this.repos.writeAudit({
      organizationId: task.organizationId, actorId: task.createdBy, action: 'task.completed',
      targetType: 'task', targetId: task.id, metadata: { employeeId: task.employeeId, tokensIn, tokensOut, costUsd },
    })
  }

  private async retrieveContext(orgId: string, employeeId: string | null): Promise<string> {
    const [docs, memory] = await Promise.all([
      this.repos.listDocuments(orgId),
      this.repos.listMemory(orgId, { employeeId }),
    ])
    const parts: string[] = []
    for (const d of docs) {
      if (d.extractedText) parts.push(`[Document: ${d.name}]\n${d.extractedText.slice(0, 4000)}`)
    }
    for (const m of memory) {
      parts.push(`[Memory/${m.topic}] ${m.text}`)
    }
    return parts.join('\n\n')
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('TASK_TIMEOUT')), ms)
      p.then(
        (v) => { clearTimeout(t); resolve(v) },
        (e) => { clearTimeout(t); reject(e) },
      )
    })
  }

  private async failTask(task: Task, err: Error): Promise<void> {
    const code = (err as any)?.code
    if (err.message === 'TASK_CANCELLED') {
      await this.repos.updateTask(task.id, { status: 'cancelled', finishedAt: new Date().toISOString() })
      return
    }
    if (err.message === 'TASK_TIMEOUT') {
      await this.repos.updateTask(task.id, { status: 'failed', error: 'Task exceeded the maximum allowed duration.', finishedAt: new Date().toISOString() })
      return
    }
    // Retry if attempts remain.
    const fresh = await this.repos.getTask(task.id)
    const attempts = fresh?.attempts ?? task.attempts
    const maxAttempts = fresh?.maxAttempts ?? task.maxAttempts
    if (attempts < maxAttempts) {
      // Re-queue; claimNextQueued will increment attempts on next pickup.
      await this.repos.updateTask(task.id, { status: 'queued', lockedBy: null, lockedUntil: null, error: err.message.slice(0, 500) })
      return
    }
    const message = err instanceof GatewayError ? 'Model provider error during execution.' : `Task failed: ${err.message.slice(0, 300)}`
    await this.repos.updateTask(task.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() })
    await this.repos.writeAudit({
      organizationId: task.organizationId, actorId: task.createdBy, action: 'task.failed',
      targetType: 'task', targetId: task.id, metadata: { error: message },
    })
  }
}

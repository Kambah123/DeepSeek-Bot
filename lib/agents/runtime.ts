/**
 * Agent runtime adapter. Adapted from ds-bot's turn/prompt design, but scoped to
 * one organization and one employee, and run behind the server-side model
 * gateway. The loop is bounded by the employee's limits (duration, tool calls,
 * tokens). Tool execution is restricted to a safe, explicit allow list — there is
 * no OS/shell access and no uncontrolled external side effects by default.
 */
import type { ChatMessage, ModelGateway, ModelResponse, ToolCall } from '../gateway/gateway'
import { scrubSecrets } from '../secrets/scrub'

export interface TurnDeps {
  gateway: ModelGateway
  executeTool: (call: ToolCall) => Promise<string>
  maxToolCalls: number
  maxTokens?: number
  /** Called after every model response so usage can be recorded per call. */
  onUsage?: (res: ModelResponse) => void
  /** Checked before each model call; if it resolves true the turn is aborted. */
  shouldAbort?: () => boolean | Promise<boolean>
}

export interface TurnResult {
  content: string
  toolCalls: number
  lastResponse: ModelResponse
}

export function buildSystemContext(
  systemPrompt: string,
  knowledgeText: string,
  memoryText: string,
): string {
  const parts = [systemPrompt]
  if (knowledgeText && knowledgeText.trim()) {
    parts.push(`# Company knowledge (approved sources only)\n${knowledgeText}`)
  }
  if (memoryText && memoryText.trim()) {
    parts.push(`# Memory\n${memoryText}`)
  }
  return parts.join('\n\n')
}

export async function runTurn(
  deps: TurnDeps,
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
): Promise<TurnResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userInput },
  ]
  let toolCallsMade = 0
  let last: ModelResponse | null = null

  for (let i = 0; i <= deps.maxToolCalls; i++) {
    if (deps.shouldAbort && (await deps.shouldAbort())) {
      throw new Error('TASK_CANCELLED')
    }
    const res = await deps.gateway.complete({ model: '', messages, maxTokens: deps.maxTokens })
    last = res
    deps.onUsage?.(res)
    messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls })

    if (res.toolCalls.length === 0) {
      return { content: res.content, toolCalls: toolCallsMade, lastResponse: res }
    }

    // Execute the requested tools, but only up to the employee's limit.
    if (toolCallsMade + res.toolCalls.length > deps.maxToolCalls) {
      messages.push({
        role: 'tool',
        content: 'Tool limit reached for this task; no further tool calls will be executed.',
        toolCallId: res.toolCalls[0].id,
        name: res.toolCalls[0].name,
      })
      // one more pass to let the model wrap up without tools
      continue
    }
    for (const call of res.toolCalls) {
      toolCallsMade += 1
      let result: string
      try {
        result = await deps.executeTool(call)
      } catch (err) {
        result = `Tool error: ${(err as Error).message}`
      }
      // Tool output is untrusted: scrub any secrets before it re-enters context.
      messages.push({ role: 'tool', content: scrubSecrets(result).slice(0, 20000), toolCallId: call.id, name: call.name })
    }
  }
  // If we exhausted the loop with tool calls, do a final summarization pass.
  if (deps.shouldAbort && (await deps.shouldAbort())) {
    throw new Error('TASK_CANCELLED')
  }
  const finalRes = await deps.gateway.complete({ model: '', messages, maxTokens: deps.maxTokens })
  last = finalRes
  deps.onUsage?.(finalRes)
  return { content: finalRes.content, toolCalls: toolCallsMade, lastResponse: finalRes }
}

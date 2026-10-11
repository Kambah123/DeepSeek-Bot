import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { getTask, listMessages } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    const task = await getTask(repos, ctx, params.id)
    let messages: unknown[] = []
    const convId = (task.output as any)?.conversationId
    if (convId) messages = await listMessages(repos, ctx, convId)
    return json({ task, messages })
  } catch (err) {
    return errorResponse(err)
  }
}

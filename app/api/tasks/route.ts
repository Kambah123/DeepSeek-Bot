import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { listTasks, createTask } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    const employeeId = req.nextUrl.searchParams.get('employeeId') ?? undefined
    const status = req.nextUrl.searchParams.get('status') as any || undefined
    return json({ tasks: await listTasks(repos, ctx, { employeeId, status }) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext()
    const body = await req.json()
    const repos = await getRepos()
    const task = await createTask(repos, ctx, {
      employeeId: String(body.employeeId ?? ''),
      message: String(body.message ?? ''),
      conversationId: body.conversationId ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
    })
    return json({ task }, 201)
  } catch (err) {
    return errorResponse(err)
  }
}

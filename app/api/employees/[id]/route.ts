import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { getEmployee, updateEmployee, deleteEmployee } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    return json({ employee: await getEmployee(repos, ctx, params.id) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const body = await req.json()
    const repos = await getRepos()
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = String(body.name)
    if (body.role !== undefined) patch.role = String(body.role)
    if (body.instructions !== undefined) patch.instructions = String(body.instructions)
    if (body.model !== undefined) patch.model = String(body.model)
    if (body.status !== undefined) patch.status = body.status
    if (body.toolPolicy !== undefined) patch.toolPolicy = body.toolPolicy
    if (body.limits !== undefined) patch.limits = body.limits
    return json({ employee: await updateEmployee(repos, ctx, params.id, patch) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    await deleteEmployee(repos, ctx, params.id)
    return json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

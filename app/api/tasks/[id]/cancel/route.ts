import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { cancelTask } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    await cancelTask(repos, ctx, params.id)
    return json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

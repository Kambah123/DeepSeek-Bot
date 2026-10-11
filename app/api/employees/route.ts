import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { listEmployees, createEmployee } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'

export async function GET() {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    return json({ employees: await listEmployees(repos, ctx) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext()
    const body = await req.json()
    const repos = await getRepos()
    const employee = await createEmployee(repos, ctx, {
      template: String(body.template ?? ''),
      name: String(body.name ?? ''),
      role: body.role ? String(body.role) : undefined,
      instructions: body.instructions ? String(body.instructions) : undefined,
      model: body.model ? String(body.model) : undefined,
    })
    return json({ employee }, 201)
  } catch (err) {
    return errorResponse(err)
  }
}

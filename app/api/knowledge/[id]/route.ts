import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { getDocument, deleteDocument } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'
import { getStorage } from '@/lib/storage'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    const doc = await getDocument(repos, ctx, params.id)
    const bytes = await getStorage().download(doc.storagePath)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': doc.contentType,
        'content-disposition': `attachment; filename="${doc.name}"`,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    await deleteDocument(repos, ctx, params.id)
    return json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

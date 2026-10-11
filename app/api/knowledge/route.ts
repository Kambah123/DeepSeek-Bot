import { NextRequest } from 'next/server'
import { json, errorResponse, requireContext } from '@/lib/api'
import { listDocuments, createDocumentRecord } from '@/lib/services/tenant'
import { getRepos } from '@/lib/db'
import { getStorage } from '@/lib/storage'
import { scrubSecrets } from '@/lib/secrets/scrub'

const ALLOWED_TYPES = new Set([
  'text/plain', 'text/markdown', 'application/pdf', 'application/json',
  'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const MAX_BYTES = 5 * 1024 * 1024

export async function GET() {
  try {
    const ctx = await requireContext()
    const repos = await getRepos()
    return json({ documents: await listDocuments(repos, ctx) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext()
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: { message: 'A file is required' } }, 422)
    if (file.size > MAX_BYTES) return json({ error: { message: 'File exceeds 5 MB limit' } }, 413)
    if (!ALLOWED_TYPES.has(file.type)) {
      return json({ error: { message: `File type ${file.type || 'unknown'} is not allowed` } }, 415)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const repos = await getRepos()
    const storagePath = `${ctx.organizationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await getStorage().upload(storagePath, bytes, file.type)

    // Extract plain-text content for the model context (treat as untrusted).
    let extractedText: string | null = null
    if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'text/csv' || file.type === 'application/json') {
      extractedText = scrubSecrets(bytes.toString('utf8').slice(0, 20000))
    }
    const doc = await createDocumentRecord(repos, ctx, {
      name: file.name, contentType: file.type, sizeBytes: file.size, storagePath,
    })
    if (extractedText) await repos.updateDocument(ctx.organizationId, doc.id, { extractedText, status: 'processed' })
    return json({ document: doc }, 201)
  } catch (err) {
    return errorResponse(err)
  }
}

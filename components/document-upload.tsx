'use client'
/**
 * Upload a company document to the organization's knowledge base. Text is
 * extracted server-side (and secret-scrubbed) so employees can use it as
 * approved context.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ACCEPT = '.txt,.md,.csv,.json,.pdf,.docx'

export function DocumentUpload() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    setNotice(null)

    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/knowledge', { method: 'POST', body })
    const data = await res.json().catch(() => null)
    setBusy(false)

    if (!res.ok) {
      setError(data?.error?.message ?? 'Upload failed')
      return
    }
    if (inputRef.current) inputRef.current.value = ''
    setNotice(
      data?.document?.status === 'processed'
        ? `“${data.document.name}” uploaded and available to your employees.`
        : `“${data?.document?.name ?? file.name}” uploaded. (Text extraction runs for plain-text and CSV/JSON files.)`,
    )
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <h2 className="font-medium text-ink-900">Add company knowledge</h2>
      <p className="mt-1 text-sm text-ink-600">
        Text, Markdown, CSV, JSON, PDF or DOCX up to 5 MB. Files are stored privately for this workspace and treated as
        untrusted content by your employees.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="block text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
        />
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
    </form>
  )
}

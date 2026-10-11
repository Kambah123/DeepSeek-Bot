import { requirePageContext } from '@/lib/server/context'
import { listDocuments } from '@/lib/services/tenant'
import { bytes, dateTime, truncate } from '@/lib/format'
import { ConfirmAction } from '@/components/confirm-action'
import { DocumentUpload } from '@/components/document-upload'
import { EmptyState, PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const { repos, ctx } = await requirePageContext()
  const documents = await listDocuments(repos, ctx)
  const usable = documents.filter((d) => d.extractedText).length

  return (
    <>
      <PageHeader
        title="Company knowledge"
        description={`${documents.length} file${documents.length === 1 ? '' : 's'} · ${usable} usable as employee context`}
      />

      <DocumentUpload />

      <div className="mt-6">
        {documents.length === 0 ? (
          <EmptyState
            title="No knowledge files yet"
            description="Upload a policy document, price list or company brief. Text-based files are turned into context your employees can use — and treated as untrusted content, so instructions inside them can never override your employee's role."
          />
        ) : (
          <div className="card divide-y divide-ink-100">
            {documents.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink-800">{doc.name}</p>
                    <span
                      className={`badge ${
                        doc.status === 'processed' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-600'
                      }`}
                    >
                      {doc.status === 'processed' ? 'In context' : doc.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {bytes(doc.sizeBytes)} · {doc.contentType || 'unknown type'} · uploaded {dateTime(doc.createdAt)}
                  </p>
                  {doc.extractedText && (
                    <p className="mt-2 max-w-2xl text-sm text-ink-600">{truncate(doc.extractedText, 160)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/knowledge/${doc.id}`}
                    className="btn-secondary"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Download
                  </a>
                  <ConfirmAction
                    url={`/api/knowledge/${doc.id}`}
                    method="DELETE"
                    label="Delete"
                    confirmText={`Delete “${doc.name}”? Employees will no longer see it as context.`}
                    className="btn-danger"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

import Link from 'next/link'

/** Branded 404 — covers deleted employees/tasks and any unknown URL. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
      <div className="card max-w-md p-8 text-center">
        <p className="text-sm font-medium text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">This page could not be found</h1>
        <p className="mt-2 text-sm text-ink-600">
          The page you were looking for doesn&apos;t exist, or the employee or task it pointed to has been removed.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}

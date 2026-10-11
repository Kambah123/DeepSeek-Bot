import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600" />
          <span className="text-lg font-semibold tracking-tight">AI Employees</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-ink-600 hover:text-ink-900">Pricing</Link>
          <Link href="/login" className="text-ink-600 hover:text-ink-900">Sign in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <span className="badge-gray mb-4">Multi-tenant AI workforce</span>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
            Hire AI employees that do real work for your business
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-600">
            Create a company workspace, configure specialized AI employees, assign tasks, and
            review completed work — all billed per plan with clear usage limits. No model keys required.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary px-6 py-3 text-base">Create your workspace</Link>
            <Link href="/pricing" className="btn-secondary px-6 py-3 text-base">View pricing</Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-20 sm:grid-cols-3">
          {[
            ['Research Analyst', 'Summarizes sources, compares competitors, and prepares structured reports.'],
            ['Marketing Assistant', 'Drafts social posts, product descriptions, campaign ideas and calendars.'],
            ['Operations Assistant', 'Organizes tasks, summarizes documents, drafts procedures and reports.'],
          ].map(([title, desc]) => (
            <div key={title} className="card p-6">
              <div className="mb-3 h-10 w-10 rounded-xl bg-brand-100" />
              <h3 className="font-semibold text-ink-900">{title}</h3>
              <p className="mt-1 text-sm text-ink-600">{desc}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Built for businesses, not developers</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-4">
              {[
                ['Organization isolation', 'Every workspace is fully segregated with row-level security.'],
                ['Server-side model gateway', 'We own model access and bill you — your team never manages keys.'],
                ['Real task queue', 'Long-running work runs on a persistent worker with retries and cancellation.'],
                ['Usage transparency', 'Track every model call, token and dollar spent by employee and org.'],
              ].map(([t, d]) => (
                <div key={t}>
                  <h4 className="font-medium text-ink-900">{t}</h4>
                  <p className="mt-1 text-sm text-ink-600">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-ink-500">
          AI Employees — adapted from the DeepSeek-Bot design. This is an MVP pilot build.
        </div>
      </footer>
    </div>
  )
}

/**
 * Next.js instrumentation hook — runs once when a server instance starts.
 *
 * We use it to start the in-process queue worker for the local (pglite) driver,
 * where a separate worker process cannot share the embedded database. The hook
 * is deliberately skipped during `next build` so prerendering never starts
 * background work, and it never runs on the edge runtime.
 *
 * Requires `experimental.instrumentationHook = true` on Next 14 (see
 * next.config.mjs).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { config } = await import('./lib/config')
  // Only the local driver needs an in-process worker; production runs the
  // standalone worker process against Supabase.
  if (config.database.driver !== 'local') return
  if (!config.worker.inline) return

  const { startInlineWorker } = await import('./lib/queue/inline')
  startInlineWorker()
}

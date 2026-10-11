/**
 * In-process worker for LOCAL development.
 *
 * The local driver (pglite) is an embedded, single-connection Postgres: a
 * separate worker process cannot share that database, so in local mode the queue
 * must be drained by the same process that serves the API. This starts one
 * polling loop that claims work exactly like the standalone worker — same
 * SKIP LOCKED claim, same limits, same persistence guarantees — so the local
 * experience matches production behaviour.
 *
 * In production (Supabase driver) this is NOT started: run `npm run worker` as a
 * separate process instead. Controlled by WORKER_INLINE (default: on for the
 * local driver only).
 */
import { getRepos } from '../db'
import { config } from '../config'
import { Worker } from './worker'

let started = false

export function startInlineWorker(): void {
  if (started) return
  started = true

  const run = async () => {
    try {
      const repos = await getRepos()
      const worker = new Worker(repos)
      console.log(`[inline-worker] started — concurrency=${config.worker.concurrency} pollMs=${config.worker.pollMs}`)
      for (;;) {
        const results = await Promise.all(
          Array.from({ length: Math.max(1, config.worker.concurrency) }, () => worker.tick()),
        )
        // Nothing claimed: back off before polling again.
        if (results.every((claimed) => !claimed)) {
          await new Promise((r) => setTimeout(r, config.worker.pollMs))
        }
      }
    } catch (err) {
      // Never let a transient DB error kill the loop permanently.
      console.error('[inline-worker] crashed; restarting in 5s', err)
      started = false
      setTimeout(() => startInlineWorker(), 5000)
    }
  }

  void run()
}

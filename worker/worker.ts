/**
 * Worker process entry point. Polls the queue and runs tasks with bounded
 * concurrency. Designed to run on a persistent Node host (Render, Fly, a VM).
 *
 * Run with:  npm run worker
 */
import { getRepos } from '../lib/db'
import { Worker } from '../lib/queue/worker'
import { config } from '../lib/config'

async function main() {
  const repos = await getRepos()
  const worker = new Worker(repos)
  const concurrency = config.worker.concurrency
  console.log(`[worker] started — concurrency=${concurrency} pollMs=${config.worker.pollMs}`)

  let running = true
  const shutdown = () => { running = false; console.log('[worker] shutting down') }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  while (running) {
    const ticks = Array.from({ length: concurrency }, () => worker.tick())
    const results = await Promise.all(ticks)
    if (results.every((r) => !r)) {
      await new Promise((r) => setTimeout(r, config.worker.pollMs))
    }
  }
}

main().catch((err) => {
  console.error('[worker] fatal', err)
  process.exit(1)
})

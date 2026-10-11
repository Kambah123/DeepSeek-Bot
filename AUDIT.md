# Audit Report — Building an AI Employees SaaS from DeepSeek-Bot

**Date:** 2026-10-11
**Upstream:** https://github.com/FeiZhuLulu/DeepSeek-Bot (commit `351ae74`)
**Auditor:** senior full-stack / AI-infra / app-security engineer (automated session)

> This report records **actual** inspection and command results. Nothing here is
> claimed to be production-secure on the basis of compilation alone.

## 1. What the repository actually is

`DeepSeek-Bot` is the source repo for **DS Bot**, a *plugin* (`ds-bot/`) for
**DeepSeek Harness (DSH)** — a desktop/web agent host. It is **not** a standalone
service. Key facts established by inspection:

- `ds-bot/package.json` declares `peerDependencies` on
  `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-tools`,
  `@deepseek-ai/dsh-web`. These packages are **not published on public npm**; they
  ship inside a DSH install (`dsh` profile), per the README ("First install DSH
  and set up at least one model in it").
- The README pins the runtime to **`@deepseek-ai/dsh@0.2.1-alpha.1`** and Node
  `22.19+`. The project depends on a DSH checkout at `../deepseek-harness`
  (`DSH_HARNESS`) for its own unit tests.
- The plugin stores all state as **JSON files under `DSH_HOME`** (`state.json`,
  `memory/`, `sessions/`) — a **single-user, single-machine, local-filesystem**
  design. There is **no multi-tenancy, no auth, no RLS, no queue, no billing**.

## 2. Runtime compatibility (exact version)

| Dependency | Version | Source | Available here? |
|---|---|---|---|
| `@deepseek-ai/dsh` (runtime) | `0.2.1-alpha.1` | DSH profile / GitHub | **No** (early-access, requires install) |
| `@deepseek-ai/cordis` etc. | `*` (peer) | DSH install | **No** |
| `esbuild` | `0.28.2` | public npm | Yes (build tool only) |
| Node | `22.19+` | — | Yes (`v22.22.3`) |

**Conclusion:** the upstream *bot runtime* cannot execute in this environment, and
its architecture (local JSON, single user) is fundamentally incompatible with a
multi-tenant SaaS. Per the brief ("adapt the existing DeepSeek-Bot and compatible
DeepSeek Harness runtime … If the original runtime cannot safely support
concurrent tenants, isolate execution by organization or job"), the decision is:

> **Decision:** Reuse the upstream's *design* (agents, system-prompt structure,
> AgentMemoryRepo memory format, tool-permission policy, secret-scrubbing
> patterns, model/usage accounting) and re-implement the runtime as a
> **server-side, organization-scoped adapter** behind a provider-agnostic model
> gateway. The agent loop, not DSH's internals, is what we carry forward.

## 3. How the upstream works (traced)

- `index.js` wires ~21 host modules (`store`, `models`, `turns`, `delivery`,
  `roster`, `agents`, `prompt`, `tools`, `memory`, `groups`, `usage`, …) onto a
  Cordis `rt` context.
- **Agents/Bots:** each Bot is one DSH root Session (`roster.js`). The Main Bot
  ("Chief") has elevated rights to create/change other Bots and groups.
- **System prompts** (`prompt.js`): a stable identity section + `TEAM_RULES` +
  `MAIN_RULES`. This structure is reused for our employee system prompts.
- **Memory** (`memory.js`): AgentMemoryRepo Markdown — one fact per bullet with
  `[key: value]` metadata, a `MEMORY.md` index of `[[topics]]`. Reused for
  organization-scoped memory.
- **Tool policy** (`constants.js` `TEAM_TOOLS` + `tools.restrict`): an explicit
  allow/deny list per identity. Reused as our per-employee tool-permission policy.
- **Secrets** (`memory.js` `KEY_PATTERNS` / `PASSWORD_GIVEN`): regexes that keep
  credentials out of memory. Reused in our secret-scrubbing layer.
- **Limits** (`constants.js`, `memory.js`): `MAX_HOPS`, `MAX_EXCHANGES`,
  `MODEL_TIMEOUT_MS`, `MEMORY_LIMITS`. Reused as employee runtime limits.
- **Filesystem assumptions:** local `fs` under `DSH_HOME`; `state.json` is global
  mutable state shared across all bots → **unsafe for concurrent tenants**.

## 4. Single-user / concurrency limitations (must isolate)

1. Single global `state.json` — no per-organization isolation.
2. All data local to one machine; no persistence service, no backups.
3. No auth → no notion of a user or an organization.
4. No queue → long work blocks the request and is lost on crash.
5. No spending/quota controls; users "use their own model quota."
6. Tool surface includes OS/file/command capabilities that must be **denied by
   default** for tenant SaaS employees.

## 5. Security risks identified

- Plaintext secrets in model config / `request_secret` keys in DSH install.
- No RLS, no tenant isolation, no server-side authz (client-driven identity).
- Unsanitized file/tool output treated as trusted.
- No rate limiting, no timeout enforcement on external model calls (configurable
  only). No audit logging.

## 6. Environment available in this workspace

- Node `v22.22.3`, npm `10.9.8`. **No** pnpm, docker, Postgres server, or `psql`.
- npm registry reachable. No Supabase/Docker available locally.
- **Implication:** we cannot run a live Supabase/Postgres here, and we have no
  model API keys. The MVP must therefore (a) run locally against a real in-process
  Postgres (**pglite**, from npm) so logic and **RLS are genuinely executable in
  tests**, and (b) ship Supabase migrations (schema + auth.uid()-based RLS) for
  production. The model gateway ships a deterministic **mock provider** for local
  dev/test and an OpenAI-compatible provider (DeepSeek/OpenAI) for production, with
  keys server-side only.

## 7. Implementation plan (phases)

- **P1 — Audit & decisions.** ✅ this document.
- **P2 — Schema, auth, orgs, RLS.** `supabase/migrations/` (base + Supabase RLS +
  pglite-local RLS). `lib/db` (Database interface, pglite + Supabase adapters).
  `lib/auth` (Supabase + local signed-session provider).
- **P3 — Worker adapter, queue, one employee.** `lib/queue` state machine
  (queued→running→completed/failed/cancelled), retries/backoff, cancellation,
  timeouts, idempotent delivery. `lib/gateway` model gateway. One working employee.
- **P4 — Employee templates, conversations, tasks, real results.** 3 templates
  (Research, Marketing, Operations) with real adapted system prompts.
- **P5 — Model gateway, usage tracking, quotas, spend protection.** `usage_events`,
  per-plan/org limits, pre- and mid-flight enforcement.
- **P6 — Knowledge uploads + scoped memory.** Supabase Storage (prod) / local FS
  (dev) + organization-scoped memory store.
- **P7 — Subscription checkout, webhooks, billing UI.** Paystack integration,
  signed webhook verification, idempotency, safe-when-unconfigured.
- **P8 — Admin, security tests, reliability, docs.** `tests/` for the highest-risk
  boundaries; README with setup/env/migrations/worker/testing/deploy.

### Phase status (updated after the dashboard phase)

| Phase | Status | Evidence |
|---|---|---|
| P1 audit & decisions | ✅ | this document |
| P2 schema, auth, orgs, RLS | ✅ | `supabase/migrations/0001_init.sql`, `0002_rls.sql`; `tests/db.test.ts`, `tests/rls.test.ts` (real pglite + real policies) |
| P3 worker, queue, one employee | ✅ | `lib/queue/worker.ts`, `tests/pipeline.test.ts` (claim → run → persist; retries; cancellation) |
| P4 templates, conversations, tasks | ✅ | `lib/agents/templates.ts`, `app/api/tasks/**` |
| P5 gateway, usage, quotas | ✅ | `lib/gateway/gateway.ts`, `lib/quota/quota.ts`, `tests/quota.test.ts`, `tests/gateway.test.ts` |
| P6 knowledge + scoped memory | ✅ | `app/api/knowledge/**`, `lib/storage`, `tests/security.test.ts` (traversal + cross-tenant) |
| P7 billing (Paystack) | ✅ code-complete, unexercised | fails closed when unconfigured; HMAC-verified idempotent webhook; `tests/billing.test.ts` |
| P8 security tests, docs, UI | ✅ | **`app/dashboard/**` authenticated UI** (overview, employees, employee detail/edit, tasks, task detail, knowledge, usage/plans) |

### Verified in this phase (2026-10-11)

`npx tsc --noEmit` clean · `npm test` **23/23** · `npm run build` passes (28 routes).
Live HTTP run against `next dev` with the local (pglite) driver and the **inline
worker** draining the queue in-process:

- signup → `POST /api/auth/signup` 201 + httpOnly cookies → `/dashboard` 200 (was 404 — this was the stopping point).
- create employee → `/dashboard/employees/[id]` 200 → assign task → **inline worker completed it in ~1 s** → deliverable rendered as Markdown on `/dashboard/tasks/[id]` (385 in / 225 out tokens, $0.000351).
- knowledge upload → processed → page shows "In context" → download returns the file; employee context grew (tokensIn 385 → 421), proving the document reached the model prompt.
- plan enforcement surfaced in the UI: 2nd employee on the free plan → 429 + "Employee limit reached"; pausing an employee disables the composer.
- cross-tenant: outsider loading another org's employee page → **404**; org switch → 403.
- **Two real bugs found by this run and fixed** (both regression-tested):
  1. cancelling a *queued* task left it stuck in `queued` forever (the claim query skips `cancelled = true`), so the task page polled indefinitely — `LocalRepos.cancelTask` now terminates immediately (matching Supabase) and the worker re-checks the flag before persisting a result. `tests/pipeline.test.ts` ×3.
  2. re-running `INIT_SQL` against a persistent `PGLITE_DIR` threw `type "org_plan" already exists`, so **every route 500'd after a restart**; enum creation is now guarded and init failure is no longer cached. `tests/db.test.ts`.

Not yet exercised for real: Paystack checkout/webhooks (no keys, `BILLING_ENABLED=false`),
the Supabase driver (no Supabase instance available here), and a live model provider
(the mock provider produced these deliverables). The Docker-free local path is
fully exercised.

## 8. Honest status of this audit

- ✅ Inspected repo, manifests, lockfile, README, license, NOTICE.
- ✅ Identified exact runtime dependency and its unavailability.
- ✅ Traced agents/sessions/memory/files/model/tools/usage.
- ✅ Identified filesystem/single-user/global-state limitations.
- ✅ Ran `git status`/`log`; the upstream `npm test` requires a DSH checkout we do
  not have, so **we did not run the upstream unit suite** (it would fail on missing
  `@deepseek-ai/*`). We instead build and test our own suite.
- ✅ Build/test of the new SaaS: see "Phase status (updated after the dashboard phase)" and "Verified in this phase" above (23/23 tests, production build, live HTTP run).

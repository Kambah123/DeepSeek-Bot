# Setup — AI Employees SaaS

The multi-tenant "AI employees" app built on top of this repository's DeepSeek-Bot
design (see `AUDIT.md` for the audit, the runtime decision and the phase status).
The upstream DS Bot plugin lives untouched in `ds-bot/`.

## Run locally (no external services)

```bash
npm install
cp .env.example .env.local          # optional in dev; see "Environment" below
npm run dev                          # http://localhost:3000
```

Then open `/signup`, create a workspace, and you land on `/dashboard`.

Local defaults use the **pglite** driver (embedded Postgres, real RLS) and the
**mock** model provider, so nothing else is needed:

| Piece | Local default | Production |
|---|---|---|
| Database | pglite (`@electric-sql/pglite`) | Supabase Postgres + RLS |
| Model | deterministic `mock` gateway | OpenAI-compatible (DeepSeek/OpenAI) |
| Files | `.storage/` on disk | Supabase Storage |
| Queue | **inline worker** inside the web server | `npm run worker` (separate process) |
| Billing | disabled (checkout fails closed) | Paystack |

The worker must run in-process locally: pglite is embedded, so a separate worker
process cannot share the database. `lib/queue/inline.ts` starts a polling loop
from `instrumentation.ts` whenever the local driver is active
(`WORKER_INLINE=true`, the default for `DATABASE_DRIVER=local`).

To keep local data across restarts, point pglite at a directory:

```bash
PGLITE_DIR=.pglite npm run dev
```

## Environment

All secrets are server-side only; only `NEXT_PUBLIC_*` values reach the browser.
`.env.example` documents every variable. The ones that change behaviour:

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Signs session tokens. **Required in production** (the app fails closed without it); a dev fallback is used in development. |
| `DATABASE_DRIVER` | `local` (pglite) or `supabase`. |
| `PGLITE_DIR` | Persist the local database to disk. |
| `MODEL_PROVIDER` | `mock` or `openai-compatible` (+ `MODEL_GATEWAY_BASE_URL`, `MODEL_GATEWAY_API_KEY`). |
| `WORKER_INLINE` | Drain the queue inside the web server (default: `true` for local, `false` for Supabase). |
| `BILLING_ENABLED` + `PAYSTACK_SECRET_KEY` | Turn on Paystack checkout; until then upgrade buttons return a clear "billing is not configured" message instead of pretending to charge. |

## Commands

```bash
npm run dev         # local dev server (inline worker on)
npm test            # 23 tests: db, pipeline, tenant isolation, quota, gateway, security, billing, RLS (real pglite)
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run worker      # standalone worker — Supabase mode only
```

## Production (Supabase + Paystack)

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`, then
   `0002_rls.sql` (enables row-level security and the `auth.uid()` policies).
2. Set `DATABASE_DRIVER=supabase`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`.
3. Configure the model provider (`MODEL_PROVIDER=openai-compatible` + base URL/key)
   so employee work is executed by a real model.
4. Deploy the web app and run `npm run worker` as a second process (or a scheduled
   worker) — the queue is claimed with `FOR UPDATE SKIP LOCKED`, so N workers are
   safe.
5. Point the Paystack webhook at `/api/billing/webhook`; signatures are verified
   and handled idempotently. Never trust the client redirect — `/api/billing/verify`
   re-checks the transaction server-side before a plan changes.

## Design invariants worth keeping

- The active organization is verified against `organization_members` on every
  request; the org cookie is only a preference, never proof of access.
- Every repository query is organization-scoped, and RLS backs that up.
- The worker marks a task `completed` only after the message, output and usage rows
  are persisted; cancelled tasks reach a terminal state immediately.
- Model output, documents and tool results are untrusted: secrets are scrubbed,
  prompt-injection text is ignored, and links in deliverables are only turned into
  anchors when they are `http(s)`.

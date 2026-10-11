-- =============================================================================
-- 0001_init.sql — base schema for the AI Employees SaaS
-- Backend-agnostic: runs on Supabase Postgres AND on local pglite (dev/test).
-- RLS is ENABLED in 0002_rls.sql (Supabase) / rls-local.sql (pglite).
-- Every tenant-owned row carries organization_id, enforced by RLS + the app.
-- =============================================================================

-- gen_random_uuid() is built into modern Postgres and used for default ids.

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user; mirrors the Supabase auth.users id).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Organizations (a company workspace).
-- ---------------------------------------------------------------------------
create type org_plan as enum ('free', 'starter', 'pro', 'business');
create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  plan            org_plan not null default 'free',
  spend_limit_usd numeric(12,2) not null default 10,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Organization members (user <-> org, with a role).
-- ---------------------------------------------------------------------------
create type member_role as enum ('owner', 'admin', 'member');
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            member_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Subscriptions (recurring billing state, synced from the payment provider).
-- ---------------------------------------------------------------------------
create type sub_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create table if not exists public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  plan                      org_plan not null,
  status                    sub_status not null default 'trialing',
  provider                  text not null default 'paystack',
  provider_subscription_id  text,
  provider_customer_id      text,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organization_id, provider)
);

-- ---------------------------------------------------------------------------
-- AI employees (configured agents scoped to an organization).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_employees (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  role           text not null default '',
  template       text not null,
  instructions   text not null default '',
  model          text not null default '',
  tool_policy     jsonb not null default '{"allow":[]}'::jsonb,
  limits         jsonb not null default '{}'::jsonb,
  status         text not null default 'active',
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ai_employees_org_idx on public.ai_employees(organization_id);

-- ---------------------------------------------------------------------------
-- Conversations (chat threads between a user and one employee).
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid references public.ai_employees(id) on delete set null,
  title           text not null default 'New conversation',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists conversations_org_idx on public.conversations(organization_id);
create index if not exists conversations_employee_idx on public.conversations(employee_id);

-- ---------------------------------------------------------------------------
-- Messages (turns within a conversation).
-- ---------------------------------------------------------------------------
create type msg_role as enum ('system', 'user', 'assistant', 'tool');
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             msg_role not null,
  content          text not null default '',
  tool_calls       jsonb,
  tool_call_id     text,
  created_at       timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists messages_org_idx on public.messages(organization_id);

-- ---------------------------------------------------------------------------
-- Tasks (async work; lifecycle queued->running->completed|failed|cancelled).
-- ---------------------------------------------------------------------------
create type task_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  employee_id       uuid references public.ai_employees(id) on delete set null,
  conversation_id   uuid references public.conversations(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  type              text not null default 'chat',
  status            task_status not null default 'queued',
  input             jsonb not null default '{}'::jsonb,
  output            jsonb,
  error             text,
  attempts          integer not null default 0,
  max_attempts      integer not null default 3,
  idempotency_key   text,
  cancelled         boolean not null default false,
  locked_by         text,
  locked_until      timestamptz,
  scheduled_for     timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  duration_ms       integer,
  tokens_in         integer not null default 0,
  tokens_out        integer not null default 0,
  cost_usd          numeric(12,6) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists tasks_status_idx on public.tasks(status, scheduled_for) where status in ('queued');
create index if not exists tasks_org_idx on public.tasks(organization_id);
create index if not exists tasks_employee_idx on public.tasks(employee_id);
create unique index if not exists tasks_idempotency_idx on public.tasks(organization_id, idempotency_key) where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Knowledge documents (private company files; bytes live in Storage).
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  storage_path    text not null,
  content_type    text not null default 'application/octet-stream',
  size_bytes      bigint not null default 0,
  status          text not null default 'uploaded',
  extracted_text  text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists knowledge_org_idx on public.knowledge_documents(organization_id);

-- ---------------------------------------------------------------------------
-- Memory items (organization-scoped facts; AgentMemoryRepo-style entries).
-- ---------------------------------------------------------------------------
create table if not exists public.memory_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid references public.ai_employees(id) on delete cascade,
  topic           text not null default 'general',
  text            text not null,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists memory_org_idx on public.memory_items(organization_id);
create index if not exists memory_employee_idx on public.memory_items(employee_id);

-- ---------------------------------------------------------------------------
-- Usage events (one row per model call; drives cost + quota enforcement).
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  employee_id     uuid references public.ai_employees(id) on delete set null,
  task_id         uuid references public.tasks(id) on delete set null,
  provider        text not null,
  model           text not null,
  tokens_in       integer not null default 0,
  tokens_out      integer not null default 0,
  cost_usd        numeric(12,6) not null default 0,
  status          text not null default 'ok',
  created_at      timestamptz not null default now()
);
create index if not exists usage_org_idx on public.usage_events(organization_id, created_at);
create index if not exists usage_task_idx on public.usage_events(task_id);

-- ---------------------------------------------------------------------------
-- Audit logs (security-sensitive changes; immutable).
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,
  target_type    text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists audit_org_idx on public.audit_logs(organization_id, created_at);

-- ---------------------------------------------------------------------------
-- claim_next_task: atomically claim one queued task for a worker (SKIP LOCKED).
-- Used by the worker through an RPC; not reachable from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_task(worker text, now_ts timestamptz)
returns setof public.tasks
language plpgsql
as $$
declare r public.tasks%rowtype;
begin
  with cte as (
    select id from public.tasks
    where status = 'queued' and scheduled_for <= now_ts and cancelled = false
      and (locked_until is null or locked_until < now_ts)
    order by scheduled_for asc limit 1 for update skip locked
  )
  update public.tasks set status = 'running', attempts = attempts + 1, started_at = now(),
    locked_by = worker, locked_until = now() + interval '5 minutes', updated_at = now()
  from cte where public.tasks.id = cte.id
  returning public.tasks.* into r;
  if found then return next r; end if;
end $$;

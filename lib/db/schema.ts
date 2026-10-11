/**
 * Embedded DDL for the LOCAL (pglite) database driver. This mirrors
 * supabase/migrations/0001_init.sql and supabase/rls-local.sql so the same
 * schema + real Postgres RLS run in local dev and CI without external services.
 * Keep in sync with those files when changing the schema.
 */
export const INIT_SQL = `
-- gen_random_uuid() is built into modern Postgres (used for default ids).

create table if not exists public.profiles (
  id uuid primary key, email text not null, full_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Enum types cannot use IF NOT EXISTS, so creation is guarded: this script must
-- be safe to re-run against an existing database (e.g. a persistent PGLITE_DIR).
do $$ begin
  create type org_plan as enum ('free','starter','pro','business');
exception when duplicate_object then null; end $$;
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  plan org_plan not null default 'free', spend_limit_usd numeric(12,2) not null default 10,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Enum types cannot use IF NOT EXISTS, so creation is guarded: this script must
-- be safe to re-run against an existing database (e.g. a persistent PGLITE_DIR).
do $$ begin
  create type member_role as enum ('owner','admin','member');
exception when duplicate_object then null; end $$;
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'member', created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Enum types cannot use IF NOT EXISTS, so creation is guarded: this script must
-- be safe to re-run against an existing database (e.g. a persistent PGLITE_DIR).
do $$ begin
  create type sub_status as enum ('trialing','active','past_due','canceled','expired');
exception when duplicate_object then null; end $$;
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  plan org_plan not null, status sub_status not null default 'trialing', provider text not null default 'paystack',
  provider_subscription_id text, provider_customer_id text, current_period_start timestamptz,
  current_period_end timestamptz, cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.ai_employees (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, role text not null default '', template text not null, instructions text not null default '',
  model text not null default '', tool_policy jsonb not null default '{"allow":[]}'::jsonb, limits jsonb not null default '{}'::jsonb,
  status text not null default 'active', created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ai_employees_org_idx on public.ai_employees(organization_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.ai_employees(id) on delete set null, title text not null default 'New conversation',
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_org_idx on public.conversations(organization_id);
create index if not exists conversations_employee_idx on public.conversations(employee_id);

-- Enum types cannot use IF NOT EXISTS, so creation is guarded: this script must
-- be safe to re-run against an existing database (e.g. a persistent PGLITE_DIR).
do $$ begin
  create type msg_role as enum ('system','user','assistant','tool');
exception when duplicate_object then null; end $$;
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade, role msg_role not null,
  content text not null default '', tool_calls jsonb, tool_call_id text, created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists messages_org_idx on public.messages(organization_id);

-- Enum types cannot use IF NOT EXISTS, so creation is guarded: this script must
-- be safe to re-run against an existing database (e.g. a persistent PGLITE_DIR).
do $$ begin
  create type task_status as enum ('queued','running','completed','failed','cancelled');
exception when duplicate_object then null; end $$;
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.ai_employees(id) on delete set null, conversation_id uuid references public.conversations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null, type text not null default 'chat', status task_status not null default 'queued',
  input jsonb not null default '{}'::jsonb, output jsonb, error text, attempts integer not null default 0, max_attempts integer not null default 3,
  idempotency_key text, cancelled boolean not null default false, locked_by text, locked_until timestamptz,
  scheduled_for timestamptz not null default now(), started_at timestamptz, finished_at timestamptz, duration_ms integer,
  tokens_in integer not null default 0, tokens_out integer not null default 0, cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tasks_status_idx on public.tasks(status, scheduled_for) where status in ('queued');
create index if not exists tasks_org_idx on public.tasks(organization_id);
create index if not exists tasks_employee_idx on public.tasks(employee_id);
create unique index if not exists tasks_idempotency_idx on public.tasks(organization_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, storage_path text not null, content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0, status text not null default 'uploaded', extracted_text text,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_org_idx on public.knowledge_documents(organization_id);

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.ai_employees(id) on delete cascade, topic text not null default 'general', text text not null,
  meta jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists memory_org_idx on public.memory_items(organization_id);
create index if not exists memory_employee_idx on public.memory_items(employee_id);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null, employee_id uuid references public.ai_employees(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null, provider text not null, model text not null,
  tokens_in integer not null default 0, tokens_out integer not null default 0, cost_usd numeric(12,6) not null default 0,
  status text not null default 'ok', created_at timestamptz not null default now()
);
create index if not exists usage_org_idx on public.usage_events(organization_id, created_at);
create index if not exists usage_task_idx on public.usage_events(task_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null, action text not null, target_type text, target_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_org_idx on public.audit_logs(organization_id, created_at);

create or replace function public.claim_next_task(worker text, now_ts timestamptz)
returns setof public.tasks language plpgsql as $$
declare r public.tasks%rowtype;
begin
  with cte as (
    select id from public.tasks
    where status='queued' and scheduled_for <= now_ts and cancelled=false
      and (locked_until is null or locked_until < now_ts)
    order by scheduled_for asc limit 1 for update skip locked
  )
  update public.tasks set status='running', attempts=attempts+1, started_at=now(),
    locked_by=worker, locked_until=now()+interval '5 minutes', updated_at=now()
  from cte where public.tasks.id=cte.id
  returning public.tasks.* into r;
  if found then return next r; end if;
end $$;

-- Local-mode credentials (only used when DATABASE_DRIVER=local; Supabase auth
-- handles credentials in production). Passwords are scrypt-hashed, never plaintext.
create table if not exists public.auth_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
`

export const LOCAL_RLS_SQL = `
create or replace function public.app_is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid);
$$;

create or replace function public.app_is_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid and m.role in ('owner','admin'));
$$;

alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select using (id = nullif(current_setting('app.user_id', true), '')::uuid);
create policy profiles_self_update on public.profiles for update using (id = nullif(current_setting('app.user_id', true), '')::uuid) with check (id = nullif(current_setting('app.user_id', true), '')::uuid);

alter table public.organizations enable row level security;
create policy orgs_member_select on public.organizations for select using (public.app_is_member(id));
create policy orgs_admin_update on public.organizations for update using (public.app_is_admin(id)) with check (public.app_is_admin(id));

alter table public.organization_members enable row level security;
create policy members_self_or_org on public.organization_members for select using (user_id = nullif(current_setting('app.user_id', true), '')::uuid or public.app_is_member(organization_id));
create policy members_admin_write on public.organization_members for insert with check (public.app_is_admin(organization_id));
create policy members_admin_delete on public.organization_members for delete using (public.app_is_admin(organization_id));

alter table public.subscriptions enable row level security;
create policy subs_member on public.subscriptions for select using (public.app_is_member(organization_id));
create policy subs_admin_write on public.subscriptions for all using (public.app_is_admin(organization_id)) with check (public.app_is_admin(organization_id));

do $$
declare t text;
begin
  foreach t in array array['ai_employees','conversations','messages','tasks','knowledge_documents','memory_items','usage_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_member_select on public.%I for select using (public.app_is_member(organization_id))', t, t);
    execute format('create policy %I_member_insert on public.%I for insert with check (public.app_is_member(organization_id))', t, t);
    execute format('create policy %I_member_update on public.%I for update using (public.app_is_member(organization_id)) with check (public.app_is_member(organization_id))', t, t);
    execute format('create policy %I_member_delete on public.%I for delete using (public.app_is_member(organization_id))', t, t);
  end loop;
end $$;

alter table public.audit_logs enable row level security;
create policy audit_member_select on public.audit_logs for select using (organization_id is null or public.app_is_member(organization_id));
create policy audit_insert on public.audit_logs for insert with check (true);
`

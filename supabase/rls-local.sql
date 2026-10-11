-- =============================================================================
-- rls-local.sql — pglite/Postgres variant of the RLS policies for LOCAL dev and
-- automated RLS tests. Instead of Supabase's auth.uid(), it reads session GUCs
-- (app.user_id, app.org_id) that the local store / test set per request. The
-- policy *logic* mirrors 0002_rls.sql exactly, so the test exercises the same
-- isolation rules against a real Postgres RLS engine.
-- =============================================================================

create or replace function public.app_is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
$$;

create or replace function public.app_is_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      and m.role in ('owner', 'admin')
  );
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
  foreach t in array array[
    'ai_employees','conversations','messages','tasks',
    'knowledge_documents','memory_items','usage_events'
  ] loop
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

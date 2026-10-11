-- =============================================================================
-- 0002_rls.sql — Row Level Security for Supabase (production).
-- Tenant isolation is enforced here AND in the application layer. Never trust a
-- client-provided organization id: every policy resolves membership from the
-- authenticated user (auth.uid()) against organization_members.
-- =============================================================================

-- Helper: is the current user a member of the given organization?
create or replace function public.user_is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Helper: is the current user an owner/admin of the given organization?
create or replace function public.user_is_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.organizations enable row level security;
create policy orgs_member_select on public.organizations
  for select using (public.user_is_member(id));
create policy orgs_admin_update on public.organizations
  for update using (public.user_is_admin(id)) with check (public.user_is_admin(id));

alter table public.organization_members enable row level security;
create policy members_self_or_org on public.organization_members
  for select using (user_id = auth.uid() or public.user_is_member(organization_id));
create policy members_admin_write on public.organization_members
  for insert with check (public.user_is_admin(organization_id));
create policy members_admin_delete on public.organization_members
  for delete using (public.user_is_admin(organization_id));

alter table public.subscriptions enable row level security;
create policy subs_member on public.subscriptions
  for select using (public.user_is_member(organization_id));
create policy subs_admin_write on public.subscriptions
  for all using (public.user_is_admin(organization_id))
  with check (public.user_is_admin(organization_id));

-- Tenant tables: a row is visible only to members of its organization.
do $$
declare t text;
begin
  foreach t in array array[
    'ai_employees','conversations','messages','tasks',
    'knowledge_documents','memory_items','usage_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_member_select on public.%I for select using (public.user_is_member(organization_id))', t, t);
    execute format(
      'create policy %I_member_insert on public.%I for insert with check (public.user_is_member(organization_id))', t, t);
    execute format(
      'create policy %I_member_update on public.%I for update using (public.user_is_member(organization_id)) with check (public.user_is_member(organization_id))', t, t);
    execute format(
      'create policy %I_member_delete on public.%I for delete using (public.user_is_member(organization_id))', t, t);
  end loop;
end $$;

-- Audit logs: members may read their org's entries; anyone authenticated may insert
-- (the server writes these with the service role, which bypasses RLS anyway).
alter table public.audit_logs enable row level security;
create policy audit_member_select on public.audit_logs
  for select using (organization_id is null or public.user_is_member(organization_id));
create policy audit_insert on public.audit_logs
  for insert with check (true);

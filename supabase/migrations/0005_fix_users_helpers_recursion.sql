-- Fix infinite recursion in RLS policies for `public.users`.
--
-- Root cause:
-- - Helper functions `public.current_org_id()` / `public.current_role()` query `public.users`.
-- - Some RLS policies on `public.users` call helper functions which re-enter RLS evaluation,
--   causing stack depth / recursion errors.
--
-- Fix approach:
-- 1) Replace the helper functions with SECURITY DEFINER versions so they can read
--    `public.users` without re-entering the same RLS evaluation path.
-- 2) Restore `users_admin_read_org` policy to use the helpers (without subqueries).

-- Replace RLS helper: current_org_id()
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.organization_id
  from public.users u
  where u.id = auth.uid()
$$;

-- Replace RLS helper: current_role()
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
$$;

-- Restore non-recursive policy for admins reading the org user list.
drop policy if exists "users_admin_read_org" on public.users;

create policy "users_admin_read_org"
on public.users
for select
to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_role() = 'admin'
);


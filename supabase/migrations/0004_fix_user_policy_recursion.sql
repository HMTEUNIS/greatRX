-- Fix potential infinite recursion/stack overflow when selecting from `public.users`
-- in combination with helper functions `public.current_org_id()` / `public.current_role()`.
--
-- Root cause:
-- - Helper functions query `public.users`
-- - RLS policy "users_admin_read_org" previously used helper functions, which re-enter
--   the same RLS/policy evaluation path.
-- - Postgres can hit a recursion/stack depth limit.
--
-- This migration rewrites "users_admin_read_org" to avoid calling helper functions.

-- Replace the policy with a non-recursive version.
drop policy if exists "users_admin_read_org" on public.users;

create policy "users_admin_read_org"
on public.users
for select
to authenticated
using (
  organization_id = (
    select u2.organization_id
    from public.users u2
    where u2.id = auth.uid()
      and u2.role = 'admin'::public.user_role
    limit 1
  )
);


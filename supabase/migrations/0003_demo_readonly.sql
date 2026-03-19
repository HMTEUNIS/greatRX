-- ZenGarden "demo" role: allow browsing, deny writes via RLS.

-- 1) Add enum value
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'user_role'
      and e.enumlabel = 'demo'
  ) then
    alter type public.user_role add value 'demo';
  end if;
end $$;

-- 2) Deny ticket writes for demo users (restrictive policies combine with existing permissive policies).
create policy "tickets_insert_no_demo"
on public.tickets
as restrictive
for insert
to authenticated
with check (public.current_role()::text <> 'demo');

create policy "tickets_update_no_demo"
on public.tickets
as restrictive
for update
to authenticated
using (public.current_role()::text <> 'demo')
with check (public.current_role()::text <> 'demo');

create policy "ticket_comments_insert_no_demo"
on public.ticket_comments
as restrictive
for insert
to authenticated
with check (public.current_role()::text <> 'demo');

-- 3) Ensure trigger-written status history can be inserted (and still block demo).
create policy "status_history_insert_org_non_demo"
on public.ticket_status_history
for insert
to authenticated
with check (
  organization_id = public.current_org_id()
  and public.current_role()::text <> 'demo'
);

-- 4) Let demo users read the org's user list (read-only "Admin" experience).
create policy "users_read_org_demo"
on public.users
for select
to authenticated
using (organization_id = public.current_org_id() and public.current_role()::text = 'demo');


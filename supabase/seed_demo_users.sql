-- ZenGarden demo users (roles/org mapping only)
--
-- This script seeds `public.users` rows (roles: admin/agent/demo) for demo accounts.
-- It does NOT create Auth users in `auth.users` because many Supabase projects
-- do not expose SQL functions to create auth users with passwords.
--
-- Preconditions (must be true):
-- - auth.users already contains users with the emails below.
--   You can create them via:
--   - ZenGarden signup/login (create 3 accounts), or
--   - Supabase Auth UI/invite flow.
--
-- What it does:
-- - Ensures `public.organizations` row "Default" exists
-- - Looks up auth.user ids by email
-- - Upserts public.users for those ids with correct roles

begin;

do $$
declare
  org_id uuid;

  admin_email text := 'admin@zengarden.dummy';
  admin_role  public.user_role := 'admin';

  agent_email text := 'agent@zengarden.dummy';
  agent_role  public.user_role := 'agent';

  demo_email  text := 'demo@zengarden.dummy';
  demo_role   public.user_role := 'demo';

  admin_uid uuid;
  agent_uid uuid;
  demo_uid  uuid;
begin
  insert into public.organizations (name)
  values ('Default')
  on conflict (name) do nothing;

  -- Prefer org named "Default" if it exists; otherwise fall back to the first org.
  select o.id into org_id
  from public.organizations o
  where o.name = 'Default'
  limit 1;

  if org_id is null then
    select o.id into org_id
    from public.organizations o
    order by o.created_at asc
    limit 1;
  end if;

  if org_id is null then
    raise exception 'Failed to resolve organization_id (no organizations found)';
  end if;

  select u.id into admin_uid from auth.users u where lower(u.email) = lower(admin_email) limit 1;
  select u.id into agent_uid from auth.users u where lower(u.email) = lower(agent_email) limit 1;
  select u.id into demo_uid  from auth.users u where lower(u.email) = lower(demo_email)  limit 1;

  if admin_uid is null then
    raise exception 'Missing auth user for % (create it first via Supabase/ZenGarden signup)', admin_email;
  end if;
  if agent_uid is null then
    raise exception 'Missing auth user for % (create it first via Supabase/ZenGarden signup)', agent_email;
  end if;
  if demo_uid is null then
    raise exception 'Missing auth user for % (create it first via Supabase/ZenGarden signup)', demo_email;
  end if;

  -- Ensure the upsert works even if RLS is enabled on public.users.
  execute 'alter table public.users disable row level security';

  insert into public.users (id, organization_id, role)
  values
    (admin_uid, org_id, admin_role),
    (agent_uid, org_id, agent_role),
    (demo_uid,  org_id, demo_role)
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        role = excluded.role;

  execute 'alter table public.users enable row level security';
end $$;

commit;


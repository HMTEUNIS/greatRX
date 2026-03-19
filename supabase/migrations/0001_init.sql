-- ZenGarden schema (production-oriented)

-- Extensions
create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type public.user_role as enum ('admin', 'agent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ticket_status as enum ('new', 'open', 'pending', 'solved', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.email_direction as enum ('in', 'out');
exception when duplicate_object then null;
end $$;

-- Core org model
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- users extends auth.users
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  role public.user_role not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ticketing
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject text not null,
  description text not null default '',
  type text not null default 'question',
  status public.ticket_status not null default 'new',
  priority public.ticket_priority not null default 'normal',
  tags text[] not null default '{}',
  requester_id uuid references public.users(id) on delete set null,
  assignee_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_status public.ticket_status,
  to_status public.ticket_status not null,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Apps
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  version text not null default '0.0.0',
  location text not null default 'sidebar',
  iframe_url text not null,
  manifest_json jsonb not null default '{}'::jsonb,
  installed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, iframe_url)
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, app_id)
);

-- Webhooks
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  events text[] not null default '{}',
  target_url text not null,
  secret text not null,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event_name text not null,
  attempt int not null default 1,
  request_payload jsonb not null,
  response_status int,
  response_body text,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

-- Automation
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_event text not null, -- created|updated|solved
  is_active boolean not null default true,
  condition jsonb not null default '{}'::jsonb, -- evaluated by automation engine
  actions jsonb not null default '{}'::jsonb, -- executed by automation engine
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Email (simulator)
create table if not exists public.email_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'gmail',
  imap_host text not null default 'imap.gmail.com',
  imap_port int not null default 993,
  smtp_host text not null default 'smtp.gmail.com',
  smtp_port int not null default 587,
  support_email text not null,
  username text,
  password_secret text, -- store encrypted/managed secret in real deployments
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, support_email)
);

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  thread_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  direction public.email_direction not null,
  provider_message_id text,
  from_email text,
  to_email text,
  subject text,
  body_text text,
  created_at timestamptz not null default now()
);

-- Updated-at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Ticket updated_at
drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_email_config_updated_at on public.email_config;
create trigger trg_email_config_updated_at
before update on public.email_config
for each row execute function public.set_updated_at();

-- Ticket status history
create or replace function public.record_ticket_status_history()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'INSERT') then
    insert into public.ticket_status_history (organization_id, ticket_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, null, new.status, auth.uid());
    return new;
  end if;

  if (old.status is distinct from new.status) then
    insert into public.ticket_status_history (organization_id, ticket_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, old.status, new.status, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ticket_status_history on public.tickets;
create trigger trg_ticket_status_history
after insert or update of status on public.tickets
for each row execute function public.record_ticket_status_history();

-- Auth user provisioning: create a public.users row for every auth.users row.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org uuid;
begin
  select o.id into default_org
  from public.organizations o
  where o.name = 'Default'
  order by o.created_at asc
  limit 1;

  insert into public.users (id, organization_id, role)
  values (new.id, default_org, 'agent')
  on conflict (id) do update set
    organization_id = coalesce(public.users.organization_id, default_org),
    role = coalesce(public.users.role, 'agent'::public.user_role);

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- RLS helpers
create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select u.organization_id
  from public.users u
  where u.id = auth.uid()
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
$$;

-- Enable RLS
alter table public.users enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_status_history enable row level security;
alter table public.apps enable row level security;
alter table public.app_settings enable row level security;
alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.automation_rules enable row level security;
alter table public.email_config enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;

-- users policies
create policy "users_select_own"
on public.users for select
to authenticated
using (id = auth.uid());

create policy "users_admin_read_org"
on public.users for select
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin');

create policy "users_update_own"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- tickets policies
create policy "tickets_select_org"
on public.tickets for select
to authenticated
using (organization_id = public.current_org_id());

create policy "tickets_insert_org"
on public.tickets for insert
to authenticated
with check (organization_id = public.current_org_id());

create policy "tickets_update_allowed"
on public.tickets for update
to authenticated
using (
  organization_id = public.current_org_id()
  and (
    public.current_role() = 'admin'
    or requester_id = auth.uid()
    or assignee_id = auth.uid()
  )
)
with check (
  organization_id = public.current_org_id()
  and (
    public.current_role() = 'admin'
    or requester_id = auth.uid()
    or assignee_id = auth.uid()
  )
);

-- ticket comments
create policy "ticket_comments_select_org"
on public.ticket_comments for select
to authenticated
using (organization_id = public.current_org_id());

create policy "ticket_comments_insert_org"
on public.ticket_comments for insert
to authenticated
with check (
  organization_id = public.current_org_id()
  and author_id = auth.uid()
);

-- status history
create policy "status_history_select_org"
on public.ticket_status_history for select
to authenticated
using (organization_id = public.current_org_id());

-- apps (admin-only write)
create policy "apps_select_org"
on public.apps for select
to authenticated
using (organization_id = public.current_org_id());

create policy "apps_admin_write"
on public.apps for all
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin')
with check (organization_id = public.current_org_id() and public.current_role() = 'admin');

create policy "app_settings_select_org"
on public.app_settings for select
to authenticated
using (organization_id = public.current_org_id());

create policy "app_settings_admin_write"
on public.app_settings for all
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin')
with check (organization_id = public.current_org_id() and public.current_role() = 'admin');

-- webhooks
create policy "webhooks_select_org"
on public.webhooks for select
to authenticated
using (organization_id = public.current_org_id());

create policy "webhooks_admin_write"
on public.webhooks for all
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin')
with check (organization_id = public.current_org_id() and public.current_role() = 'admin');

create policy "webhook_deliveries_select_org"
on public.webhook_deliveries for select
to authenticated
using (organization_id = public.current_org_id());

-- automation rules
create policy "automation_select_org"
on public.automation_rules for select
to authenticated
using (organization_id = public.current_org_id());

create policy "automation_admin_write"
on public.automation_rules for all
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin')
with check (organization_id = public.current_org_id() and public.current_role() = 'admin');

-- email config
create policy "email_config_select_org"
on public.email_config for select
to authenticated
using (organization_id = public.current_org_id());

create policy "email_config_admin_write"
on public.email_config for all
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin')
with check (organization_id = public.current_org_id() and public.current_role() = 'admin');

-- email threads/messages
create policy "email_threads_select_org"
on public.email_threads for select
to authenticated
using (organization_id = public.current_org_id());

create policy "email_messages_select_org"
on public.email_messages for select
to authenticated
using (organization_id = public.current_org_id());

create policy "email_messages_insert_org"
on public.email_messages for insert
to authenticated
with check (organization_id = public.current_org_id());

-- Seed default org (optional)
insert into public.organizations (name)
values ('Default')
on conflict (name) do nothing;

-- Useful indexes
create index if not exists idx_tickets_org_updated_at on public.tickets (organization_id, updated_at desc);
create index if not exists idx_ticket_comments_ticket_created on public.ticket_comments (ticket_id, created_at desc);
create index if not exists idx_webhook_deliveries_webhook_created on public.webhook_deliveries (webhook_id, created_at desc);


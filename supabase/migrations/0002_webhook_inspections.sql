-- Webhook inspection snippets (developer-visible "what gets sent" examples)

create table if not exists public.webhook_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event_name text not null, -- created|updated|solved
  language text not null default 'json',
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, webhook_id, event_name)
);

drop trigger if exists trg_webhook_inspections_updated_at on public.webhook_inspections;
create trigger trg_webhook_inspections_updated_at
before update on public.webhook_inspections
for each row execute function public.set_updated_at();

alter table public.webhook_inspections enable row level security;

-- Read: any authenticated user in the org can inspect snippets.
create policy "webhook_inspections_select_org"
on public.webhook_inspections for select
to authenticated
using (organization_id = public.current_org_id());

-- Write: admins only.
create policy "webhook_inspections_admin_write"
on public.webhook_inspections for all
to authenticated
using (organization_id = public.current_org_id() and public.current_role() = 'admin')
with check (organization_id = public.current_org_id() and public.current_role() = 'admin');

create index if not exists idx_webhook_inspections_webhook_id on public.webhook_inspections (webhook_id);
create index if not exists idx_webhook_inspections_org_event on public.webhook_inspections (organization_id, event_name);


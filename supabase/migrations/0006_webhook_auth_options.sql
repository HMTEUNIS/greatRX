-- Webhook auth options (MVP):
-- - none: no extra auth headers
-- - bearer: Authorization: Bearer <token>
-- - custom_headers: merge user-supplied header key/value pairs

alter table public.webhooks
  add column if not exists auth_type text not null default 'none';

alter table public.webhooks
  add column if not exists auth_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhooks_auth_type_check'
      and conrelid = 'public.webhooks'::regclass
  ) then
    alter table public.webhooks
      add constraint webhooks_auth_type_check
      check (auth_type in ('none', 'bearer', 'custom_headers'));
  end if;
end $$;


# ZenGarden

Zendesk-style simulator built with Next.js + Supabase.

## 30-Second Quickstart

1. In Supabase SQL Editor, run:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_webhook_inspections.sql`
2. Create `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   ```
3. Start the app:
   ```bash
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000`, sign up, then go to `/admin`.

## Why ZenGarden?

Building Zendesk apps or automations? Trial environments expire quickly, and production accounts are expensive for experimentation. ZenGarden is a free, self-hosted sandbox that mimics core Zendesk behavior so you can:

- Test iframe apps without a paid account
- Experiment with webhooks locally
- Build automation rules without touching real tickets
- Validate integrations before production

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6)
![Tailwind](https://img.shields.io/badge/Tailwind-38B2AC)
![Radix](https://img.shields.io/badge/Radix_UI-161616)

This project gives you:
- Ticketing flows (`new -> open -> pending -> solved -> closed`)
- Webhooks + delivery logs
- Automation rules
- App iframe sandbox + app settings
- Basic auth + role-gated admin surfaces

## 1) Minimal Supabase SQL setup (fastest path)

In Supabase:
1. Open your project
2. Go to **SQL Editor**
3. Paste and run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_webhook_inspections.sql`

That is the most direct way to create all required tables, triggers, RLS policies, helper functions, and indexes.

## 2) Required environment variables

Create `.env.local` in project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Optional flags:

```bash
# Client-side "read/demo only" mode (blocks many writes in UI)
NEXT_PUBLIC_LIVE_DEMO_MODE=false

# Server-side demo mode flag (used by runtime checks)
LIVE_DEMO_MODE=false
```

## 3) Install and run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## 4) First-use flow

1. Sign up at `/signup` (or log in at `/login`)
2. Open `/admin`
3. Create/install at least one app (for `/apps/[appId]/settings` testing)
4. Open `/apps` and then an app's Settings page

## 5) App settings behavior

Settings are stored in `app_settings.settings` (JSON) scoped by `organization_id + app_id`.

The settings page tries to build a form from:
- `apps.manifest_json.settings_schema`

If `settings_schema` is missing, the page falls back to a raw JSON editor.

## 6) Notes on current schema vs naming

Current schema includes:
- `apps`: `id, name, version, location, iframe_url, manifest_json, ...`
- `app_settings`: `app_id, organization_id, settings, ...`

If you were expecting `apps.settings_schema`, settings forms are driven by `apps.manifest_json.settings_schema`. There is currently no `apps.is_active` flag in schema or UI logic; apps are treated as available if they exist.

## 7) API endpoints you will touch most

- `GET /api/v2/tickets`
- `POST /api/v2/tickets`
- `GET /api/v2/tickets/:ticketId`
- `PATCH /api/v2/tickets/:ticketId`
- `POST /api/v2/tickets/:ticketId/comments`
- `GET /api/v2/apps/:appId/settings`
- `PUT /api/v2/apps/:appId/settings`
- `POST /api/v2/admin/webhooks`
- `PATCH /api/v2/admin/webhooks/:webhookId/inspection`

## 8) Troubleshooting

- **500 on server API calls**: check `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`
- **Auth redirect loops**: verify anon key/url are correct and auth is configured in Supabase
- **No apps visible**: create app rows from `/admin`
- **Settings page shows raw JSON only**: app has no `manifest_json.settings_schema`

## 9) Using ZenGarden as a starting point

ZenGarden is intentionally minimal: it is a foundation, not a complete product. Fork it to build custom support platforms like:

- GreatRX: pharmacy support + inventory workflows
- Internal helpdesk tools with organization-specific fields
- Custom support portals for your own integrations

The ticket core, webhook pipeline, automation engine, and iframe app host provide a strong starting point.


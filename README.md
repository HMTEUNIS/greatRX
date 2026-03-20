# ZenGarden

Zendesk-style simulator built with Next.js + Supabase.

**Continuing development / handing off to another dev or AI?** See **[`ZENGARDEN_HANDOFF.md`](./ZENGARDEN_HANDOFF.md)** for architecture notes, full migration list, env vars, and a one-line prompt you can paste into another LLM.

## 30-Second Quickstart

1. In Supabase SQL Editor, run:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_webhook_inspections.sql`
   - `supabase/migrations/0003_demo_readonly.sql`
2. Create `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=YOUR_PUBLISHABLE_DEFAULT_KEY
# SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY (optional; only needed if you run edge functions locally)
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
   - `supabase/migrations/0003_demo_readonly.sql`

That is the most direct way to create all required tables, triggers, RLS policies, helper functions, and indexes.

## 1b) Optional initial demo seed (SQL)

If you want a SQL-only setup for roles/org mapping, you can run:

- `supabase/seed_demo_users.sql`

Important: **SQL does not create Supabase Auth users.**
You must register the demo accounts via either:
- ZenGarden `/signup` flow, or
- Supabase Auth UI (create users manually)

Once the Auth users exist, `supabase/seed_demo_users.sql` will map them into `public.users` with roles (`admin`, `agent`, `demo`).

## 2) Required environment variables

Create `.env.local` in project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=YOUR_PUBLISHABLE_DEFAULT_KEY
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

1. Register the demo accounts via either:
   - ZenGarden `/signup` flow, or
   - Supabase Auth UI
   - Note: if your Supabase project has email confirmation enabled, signups may not create an active session until confirmed (you may see redirects back to `/login` until you confirm, then log in again).
   - Ensure these Auth user emails exist (the password can be anything you choose):
     - `admin@zengarden.dummy`
     - `agent@zengarden.dummy`
     - `demo@zengarden.dummy`
2. Open `/tickets` and click `Seed demo` to seed sample tickets/comments/automation rules.
3. Open `/admin`
4. Create/install at least one app (for `/apps/[appId]/settings` testing)
5. Open `/apps` and then an app's Settings page

Demo credentials (read-only):
- Email: `demo@zengarden.dummy`
- Password: `Demo1234!` (or whatever password you set when creating the demo user)

## 5) App settings behavior

Settings are stored in `app_settings.settings` (JSON) scoped by `organization_id + app_id`.

The settings page tries to build a form from:
- `apps.manifest_json.settings_schema`

If `settings_schema` is missing, the page falls back to a raw JSON editor.

## 5b) Embedding Retool and Google Sheets (Apps)

ZenGarden loads apps in a **sandboxed iframe** (`/apps/[appId]`). Third-party tools only work if **their product allows embedding** in your context (some BI tools block iframes entirely).

### Retool (recommended)

Retool generally works well in ZenGarden’s iframe.

**From the UI (admin):** open **Apps**, click the **+** button, choose **Retool**, then either:

1. **Full app URL** — paste something like `https://your-team.retool.com/apps/<uuid>` (use this for custom domains or non-`retool.com` hosts), or  
2. **Team subdomain + app path** — e.g. subdomain `acme` and path `apps/<uuid>` → stored as `https://acme.retool.com/apps/<uuid>`.

You still need to be able to open that URL when logged into Retool (or use Retool’s sharing/embed options if you use them).

**Manual / Admin:** insert an `apps` row with `iframe_url` set to your Retool app URL, same as above.

### Google Sheets

Sheets often **do** embed; sharing must allow whoever views ZenGarden to open the doc.

**From the UI (admin):** **Apps** → **+** → **Google Sheets**. Paste the full spreadsheet link (or the ID from `.../spreadsheets/d/<ID>/...`). ZenGarden stores an embed-style URL:

`https://docs.google.com/spreadsheets/d/<ID>/edit?rm=minimal&widget=true&headers=false`

If the iframe is blank, check **File → Share** in Google Sheets and browser console for `X-Frame-Options` / CSP messages.

### Other tools (e.g. Looker / Looker Studio)

Many analytics products **refuse to render inside arbitrary iframes**. For those, use **Open in new tab** workflows in your fork or link out instead of embedding.

## 6) Notes on current schema vs naming

Current schema includes:
- `apps`: `id, name, version, location, iframe_url, manifest_json, ...`
- `app_settings`: `app_id, organization_id, settings, ...`

If you were expecting `apps.settings_schema`, settings forms are driven by `apps.manifest_json.settings_schema`. There is currently no `apps.is_active` flag in schema or UI logic; apps are treated as available if they exist.

## 7) API endpoints you will touch most

- `GET /api/v2/tickets` (query `view=my|unassigned|all|archive` — active views exclude `solved`/`closed`; `archive` is solved+closed only, org-wide)
- `POST /api/v2/tickets`
- `GET /api/v2/tickets/:ticketId`
- `PATCH /api/v2/tickets/:ticketId`
- `POST /api/v2/tickets/:ticketId/comments`
- `GET /api/v2/apps/:appId/settings`
- `PUT /api/v2/apps/:appId/settings`
- `POST /api/v2/admin/webhooks`
- `PATCH /api/v2/admin/webhooks/:webhookId/inspection` (stores **payload template** per webhook + event)

### Webhook POST body (macros)

Deliveries are built by the **`webhook-deliver`** Edge Function. The body is JSON produced from the **payload template** saved on the Webhooks page (or the built-in default if you never saved one).

- Use placeholders like `{{event_name}}`, `{{ticket.subject}}`, `{{ticket.id}}`, etc. Each macro expands to a **JSON literal** (e.g. a string value becomes quoted automatically) — **do not** wrap macros in extra quotes inside the template.
- If the template does not expand to valid JSON, ZenGarden sends a small error-shaped JSON payload instead (see delivery logs).
- Full macro list and a live preview (sample ticket) are on **`/webhooks`** in the app.

## 8) Troubleshooting

- **500 on server API calls**: check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- **Auth redirect loops**: verify anon key/url are correct and auth is configured in Supabase
- **No apps visible**: create app rows from `/admin`
- **Settings page shows raw JSON only**: app has no `manifest_json.settings_schema`

## 9) Using ZenGarden as a starting point

ZenGarden is intentionally minimal: it is a foundation, not a complete product. Fork it to build custom support platforms like:

- Demos of business intelligence software
- Internal helpdesk tools with organization-specific fields
- Custom support portals for your own integrations

The ticket core, webhook pipeline, automation engine, and iframe app host provide a strong starting point.

## 10) If this helped you

If ZenGarden helped you ship a portfolio project, practice for interviews, or land a job — that’s awesome. If you want to say thanks, you’re welcome to [**buy me a coffee ☕**](https://buymeacoffee.com/hollyteunis).

> **Note:** GitHub’s README viewer doesn’t run third-party `<script>` tags, so the button below won’t render here. The link above works everywhere. Use the snippet on your own site or docs if you want the embedded button.

```html
<script
  type="text/javascript"
  src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js"
  data-name="bmc-button"
  data-slug="hollyteunis"
  data-color="#FFDD00"
  data-emoji="☕"
  data-font="Cookie"
  data-text="Buy me a coffee"
  data-outline-color="#000000"
  data-font-color="#000000"
  data-coffee-color="#ffffff"
></script>
```


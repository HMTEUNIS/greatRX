# ZenGarden — handoff context for another LLM / developer

Use this document as the primary prompt context when continuing work on this repo (fork, features, or debugging).

---

## What it is

**ZenGarden** is a **Zendesk-style simulator**: Next.js (App Router) + Supabase (Auth + Postgres + optional Edge Functions). Goals: cheap sandbox for tickets, webhooks, automations, iframe “apps,” and multi-tenant org scoping via RLS.

It is **intentionally minimal** — a foundation, not a full product.

---

## Tech stack

- **Next.js 14** (App Router), React 18, TypeScript  
- **Tailwind** + small **Radix** usage (dropdown/dialog on apps presets; `Button` uses `forwardRef` for Radix `asChild`)  
- **Supabase**: `@supabase/ssr` + `@supabase/supabase-js`  
- **Zod** for API validation  
- **Vitest** for a few unit tests (`npm test`)  
- **Edge Functions (Deno)** under `supabase/functions/` — deployed separately via Supabase CLI  

---

## Local setup (short)

1. Run SQL migrations **in order** in Supabase SQL Editor:  
   `0001_init.sql` → `0002_webhook_inspections.sql` → `0003_demo_readonly.sql` → `0004_fix_user_policy_recursion.sql` → `0005_fix_users_helpers_recursion.sql` → `0006_webhook_auth_options.sql`
2. Copy `.env.example` → `.env.local` with real project URL + publishable key.
3. `npm install` && `npm run dev`
4. Auth users live in **Supabase Auth**; `public.users` maps `id`, `organization_id`, `role`. Use `/signup` or Auth UI, then optional `supabase/seed_demo_users.sql` for role/org mapping.

See **README.md** for full detail, demo emails (`@zengarden.dummy`), and troubleshooting.

---

## Environment variables

| Variable | Role |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Browser + server anon/publishable key (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only / Edge Functions secrets (never commit) |
| `NEXT_PUBLIC_LIVE_DEMO_MODE` | Client: disables many writes in UI when `true` |
| `LIVE_DEMO_MODE` | Server-side demo flag where referenced |

`.env.local` is git-ignored; use `.env.example` as template.

---

## Roles & security

- **`public.users.role`**: `admin` | `agent` | `demo`  
- **`demo`**: read-only at **RLS** (cannot create tickets, etc.); can still browse admin-ish UIs where allowed.  
- **`admin`**: writes to webhooks, apps, app_settings, automation rules, etc. (per policies).  
- **Middleware** (`middleware.ts`): protects `/tickets`, `/admin`, `/apps`, `/webhooks`, `/automations`, `/api/*` — redirects unauthenticated users to `/login`.  
- **`lib/supabase/server.ts`**: `createServerClient` cookie adapter **must not throw** on cookie `set` in read-only contexts — writes are wrapped in `try/catch` (Next.js restriction).  
- **RLS helpers**: `public.current_org_id()`, `public.current_role()` are **`SECURITY DEFINER`** (see `0005`) to avoid recursion with `users` policies.

---

## Multi-tenancy

- **`organizations`** table; **`users.organization_id`** scopes data.  
- Most tables include `organization_id`; policies compare to `current_org_id()`.

---

## Major product surfaces (routes)

| Area | Path | Notes |
|------|------|--------|
| Tickets | `/tickets` | Tabs: **My**, **Unassigned**, **All** (only `new`/`open`/`pending`), **Solved / closed** (`view=archive`, `solved`+`closed`, org-wide). Intake: support form + mock email → `POST /api/v2/tickets/intake`. |
| Ticket detail | `/tickets/[ticketId]` | `canWrite` from role (demo read-only). |
| Apps | `/apps` | Lists apps; **admin** sees **+** presets (Retool, Google Sheets). Iframe host `/apps/[appId]` + `ZafBridge` postMessage shim. |
| App settings | `/apps/[appId]/settings` | API: `GET/PUT /api/v2/apps/[appId]/settings`; `manifest_json.settings_schema` drives form. |
| Webhooks | `/webhooks` | Create webhook via API; **payload template** per webhook+event in `webhook_inspections` with **macros**; see below. |
| Automations | `/automations` | View rules; admin triggers via `/api/v2/admin/automation-execute`. Rules created in **Admin**. |
| Admin | `/admin` | Users, webhooks, automations, apps, email config, etc. |
| Auth | `/login`, `/signup` | Demo credentials shown on login page. |

Keyboard shortcuts: `components/app-shell.tsx` (`g` + `t`/`a`/`w`/`r`/`d`/`i` for ticket intake hash).

---

## API highlights

- Tickets: `GET/POST /api/v2/tickets` (`view=my|unassigned|all|archive`), `GET/PATCH /api/v2/tickets/[id]`, comments route, **`POST /api/v2/tickets/intake`** (support_form / email_mock).  
- Apps settings: `/api/v2/apps/[appId]/settings`  
- Admin: webhooks create, webhook inspection PATCH, `automation-execute` proxy  

**Side effects:** `lib/webhooks/dispatch.ts` — `dispatchTicketSideEffects()` calls Edge Functions **best-effort** (logs errors; does **not** fail the HTTP handler after DB success).

---

## Webhooks & payload templates (important)

- **Delivery** is implemented in **`supabase/functions/webhook-deliver`**.  
- **POST body** = JSON after expanding a **template** from `webhook_inspections.code` (per `webhook_id` + `event_name`), or the **default** in `lib/webhooks/payload-template.ts` / `_shared/webhookPayloadExpand.ts` (keep in sync).  
- **Macros**: `{{event_name}}`, `{{ticket.id}}`, `{{ticket.subject}}`, … — each expands to a **JSON literal** (no extra quotes around the macro).  
- **Incoming** dispatch still passes `{ ticket_id }` in the internal payload; deliver loads the ticket and checks **org match**.  
- **Auth on outbound requests**: `webhooks.auth_type` + `auth_config` (migration `0006`).  
- **Redeploy** `webhook-deliver` after changing that function:  
  `supabase functions deploy webhook-deliver --project-ref <ref>`

---

## Automations vs webhooks (mental model)

- **Webhooks**: HTTP POST to **your** URL (can be another Edge Function URL). Notify / integrate outward.  
- **Automations**: `automation-execute` evaluates **rules** in DB and **mutates tickets** (status, assignee, tags, simulated outbound email). Can chain into webhook delivery on status change.

---

## Edge functions (folder)

- `demo-seed`, `webhook-deliver`, `automation-execute`, `email-process` (+ `_shared/` e.g. `supabaseAdmin.ts`, `webhookPayloadExpand.ts`, crypto).  
- **`tsconfig.json`** excludes `supabase/functions` from app typecheck.  
- Deploy requires **Docker** (CLI bundling) and valid **`supabase/config.toml`** (avoid stale keys that break CLI decode).

---

## Useful code locations

| Topic | Location |
|-------|-----------|
| Ticket list UI + intake + archive tab | `components/tickets/tickets-client.tsx` |
| Webhook UI + template editor | `components/webhooks/webhooks-client.tsx` |
| Macro default + expand (app/tests) | `lib/webhooks/payload-template.ts` |
| Webhook deliver | `supabase/functions/webhook-deliver/index.ts` |
| App iframe + bridge | `components/apps/app-iframe-client.tsx`, `zaf-bridge.tsx` |
| App install presets | `components/apps/apps-add-presets.tsx` |
| Ticket workflow / status | `lib/tickets/workflow.ts` (sandbox allows any distinct status transition) |
| Session / identity badge | `components/auth/session-badge.tsx` |
| Middleware auth | `middleware.ts` |

---

## Testing / quality

- `npm run typecheck`  
- `npm run lint`  
- `npm run build`  
- `npm test` (Vitest)

---

## README extras

- **§10** — Support / Buy Me a Coffee link + HTML embed snippet (GitHub README won’t run scripts; link works).

---

## Extension ideas (not implemented)

- Stricter Zendesk-like status transitions (optional flag).  
- “My” scoped archive tab.  
- More automation actions / webhook template macros (e.g. comment bodies).  
- In-app BMC widget (explicitly **not** requested).

---

## One-line prompt you can paste into another LLM

> Continue work on **ZenGarden** (Next.js 14 + Supabase): multi-tenant tickets, RLS roles (`admin`/`agent`/`demo`), webhooks with **macro payload templates** in `webhook-deliver`, automations via `automation-execute`, iframe apps + Retool/Sheets presets. Read **`ZENGARDEN_HANDOFF.md`** and **`README.md`**; migrations through **`0006_webhook_auth_options.sql`**; env uses **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`**.

---

*Generated as a continuity sheet for forks and future sessions.*

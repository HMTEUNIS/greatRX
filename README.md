# GreatRX

**Pharmacy support platform demo** built on **[ZenGarden](https://github.com/HMTEUNIS/zengarden)** (a Zendesk-style ticketing simulator). This repo is the **Next.js agent UI**: tickets, webhooks, automations, iframe apps, and a persistent **GreatRX app sidebar** with ZAF-style `postMessage` context (ticket ID, pharmacy/medication tags, org).

The centerpiece of the product story is **Retrieval-Augmented Generation (RAG)**: grouped support tickets drive playbook retrieval and an LLM interpretation for agents. The **RAG worker** that runs that pipeline lives in a **separate service** (see below)—not in this repository.

**Continuing development / handoff?** See **[`ZENGARDEN_HANDOFF.md`](./ZENGARDEN_HANDOFF.md)** for this codebase: migrations, env vars, RLS, webhooks, and API notes.

---

## RAG implementation

GreatRX uses **RAG** to interpret **groups of related support tickets**. When multiple tickets indicate a pattern (for example a medication shortage), the system retrieves relevant playbooks and generates an **AI-powered analysis** for agents.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GREATRX RAG PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Ticket   │ ── │ pgvector │ ── │ Gemini   │ ── │ Issue    │   │
│  │ Group    │    │ Similarity│    │ Flash    │    │ Group    │   │
│  │ Detected │    │ Search   │    │ 3.1 Lite │    │ Updated  │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │               │               │               │          │
│       ▼               ▼               ▼               ▼          │
│  Ticket text      Knowledge        Context +       Structured    │
│  (embedding)      Base docs        Instructions    JSON output   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### How it works

| Step | Component | Description |
|------|-----------|-------------|
| 1. Detect | Ticket grouping | Tickets with similar patterns (medication, pharmacy, issue type) are grouped |
| 2. Embed | Gemini API | Grouped ticket text is embedded (e.g. 1536-dimension vector) |
| 3. Retrieve | pgvector | Similarity search finds relevant playbooks from the knowledge base |
| 4. Generate | Gemini (e.g. Flash-Lite) | LLM synthesizes retrieved docs + ticket context into a structured interpretation |
| 5. Store | Issue groups | Interpretation is persisted (e.g. with confidence) for the agent UI |

### Worker codebase and key files

The RAG service is **[`HMTEUNIS/supabase_rag_worker`](https://github.com/HMTEUNIS/supabase_rag_worker)** — FastAPI + Supabase (PostgREST + pgvector) + configurable chat/embeddings providers. It stays domain-agnostic; callers pass `project_id`, `task`, text, metadata, and filters.

| Path (in **supabase_rag_worker**) | Purpose |
|-----------------------------------|---------|
| `rag/embeddings.py` | Embedding client (e.g. Gemini; dimension checks / truncation) |
| `rag/retrieve.py` | pgvector search via Supabase RPC |
| `rag/llm.py` | Chat completion (Gemini and optional fallbacks) |
| `rag/service.py` | Pipeline orchestration + optional persistence |
| `rag/config.py` | Per-`project_id` env loading (`{PREFIX}_*` vars) |
| `main.py` | FastAPI app, `POST /api/rag/interpret`, health checks |

See that repo’s **README** for the full API contract (`POST /api/rag/interpret`), RPC setup (`match_documents`-style functions), and deployment (e.g. Railway).

### Example environment (worker)

Variables belong on the **worker** service, not in the browser. Illustrative values (names may vary slightly; see **supabase_rag_worker** `.env.example`):

```bash
# Required (typical)
GEMINI_API_KEY=your_key
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

EMBEDDING_DIMENSION=1536
LLM_TEMPERATURE=0.2

# GreatRX tenant prefix → GREATRX_*
GREATRX_VECTOR_RPC=match_documents
GREATRX_DOCS_TABLE=knowledge_base
GREATRX_INTERPRETATIONS_TABLE=issue_groups
```

### Example response shape

When tickets about something like “Lipitor shortage at Hollywood CVS” are grouped and sent to the worker, a response can look like:

```json
{
  "interpretation": "Lipitor shortage affecting Hollywood area CVS locations. This matches Q4 2025 pattern—likely resolution in 3-5 days. Recommended: Check McKesson shipment status and contact Pfizer distributor relations.",
  "confidence": 0.85,
  "docs_used": ["lipitor_shortage_protocol", "q4_2025_analysis"],
  "model": "gemini:gemini-3.1-flash-lite"
}
```

---

## This repository (UI)

- **Fork of ZenGarden** — same ticketing core, webhooks, automations, and app iframe host.
- **GreatRX branding** in the shell and root layout metadata.
- **Collapsible app sidebar** (`components/layout/app-sidebar.tsx`) with placeholder embeds under `public/apps/*.html` and shared `public/apps/zaf-embed.js` for ZAF-style reads from the parent bridge.
- **Ticket tags** `pharmacy_id:…` and `medication_id:…` are parsed and exposed to apps via **`components/apps/zaf-bridge.tsx`** (and the ticket detail page supplies context when you are on `/tickets/[ticketId]`).

---

## Retool

A **Retool** app is intended to load inside GreatRX (and/or as a registered ZenGarden “App” iframe). **Setup and embedding notes will be added here later** once the Retool side is finalized.

---

## 30-second quickstart (this app)

1. In Supabase **SQL Editor**, run migrations **in order** (full list in [`ZENGARDEN_HANDOFF.md`](./ZENGARDEN_HANDOFF.md); at minimum through `0003_demo_readonly.sql`, preferably through `0006_webhook_auth_options.sql` for parity with upstream):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_webhook_inspections.sql`
   - `supabase/migrations/0003_demo_readonly.sql`
   - …then `0004`–`0006` as needed
2. Create `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=YOUR_PUBLISHABLE_DEFAULT_KEY
   # SUPABASE_SERVICE_ROLE_KEY=... (optional; local Edge Functions / server-only tools)
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`, sign up, then explore `/tickets` and `/admin`.

## Tech stack

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6)
![Tailwind](https://img.shields.io/badge/Tailwind-38B2AC)
![Radix](https://img.shields.io/badge/Radix_UI-161616)

Inherited from ZenGarden: ticketing flows, webhooks + delivery, automation rules, app iframe sandbox + settings, Supabase Auth + RLS roles (`admin` / `agent` / `demo`).

**Roles (UI):** Only **`admin`** can use the **+** presets on `/apps` (Retool, Sheets, embed URL) and can edit webhooks, automations, and admin tables. **`agent`** and **`demo`** can open **`/admin`**, **`/webhooks`**, and **`/automations`** to review (read-only in the UI). If you were redirected to **`/tickets`** from those routes, you were likely signed in as a user whose `public.users.role` is not one of those three (or not logged in). The home page **`/`** always redirects to **`/tickets`** by design.

## Optional demo seed (SQL)

- `supabase/seed_demo_users.sql` — maps Auth users into `public.users` with roles.

**SQL does not create Supabase Auth users.** Create users via **`/signup`** or the Supabase Auth UI, then run the seed. Demo emails often used: `admin@zengarden.dummy`, `agent@zengarden.dummy`, `demo@zengarden.dummy`.

## Environment variables (this app)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=YOUR_PUBLISHABLE_DEFAULT_KEY
```

Optional:

```bash
NEXT_PUBLIC_LIVE_DEMO_MODE=false
LIVE_DEMO_MODE=false
```

## First-use flow

1. Register users (see **Optional demo seed** above). If email confirmation is on in Supabase, confirm before login works reliably.
2. Open `/tickets` and use **Seed demo** if available to load sample data.
3. Open `/admin` to manage apps, webhooks, etc.
4. On a **ticket detail** page, open the **Apps ▶** sidebar and pick a placeholder app; ZAF context is filled from the URL and ticket tags.

## App settings & embedding third-party apps

Settings live in `app_settings.settings` (JSON), with forms driven by `apps.manifest_json.settings_schema` when present.

**Retool / Google Sheets** presets exist under **Apps → +** in the admin UI. Many BI tools block iframes; see **`ZENGARDEN_HANDOFF.md`** and upstream ZenGarden docs for caveats.

## API endpoints (common)

- `GET/POST /api/v2/tickets` (`view=my|unassigned|all|archive`)
- `GET/PATCH /api/v2/tickets/:ticketId`
- `POST /api/v2/tickets/:ticketId/comments`
- `GET/PUT /api/v2/apps/:appId/settings`
- Webhooks: `POST /api/v2/admin/webhooks`, `PATCH .../inspection` (payload templates)

Webhook delivery bodies are built by the **`webhook-deliver`** Edge Function using templates and macros — details in the handoff doc and **`/webhooks`** in the app.

## Troubleshooting

- **500 on API**: check `NEXT_PUBLIC_SUPABASE_URL` and publishable key.
- **Auth loops**: verify Supabase URL/key and Auth settings.
- **No apps**: create rows from `/admin`.
- **Settings page is raw JSON only**: missing `manifest_json.settings_schema`.

## Tests & quality

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

## Upstream & credits

GreatRX UI is a **ZenGarden fork**. ZenGarden is intentionally minimal: a foundation for ticketing demos and iframe integrations.

If ZenGarden helped you ship something cool, you can still [**buy Holly a coffee ☕**](https://buymeacoffee.com/hollyteunis).

> GitHub’s README viewer does not run third-party `<script>` tags; the link above works everywhere.

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

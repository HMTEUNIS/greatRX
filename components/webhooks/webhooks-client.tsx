"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_WEBHOOK_PAYLOAD_TEMPLATE,
  expandWebhookPayloadTemplate,
  parseExpandedWebhookBody,
  SAMPLE_TICKET_FOR_PREVIEW,
  WEBHOOK_PAYLOAD_MACRO_HELP
} from "@/lib/webhooks/payload-template";

type WebhookEvent = "created" | "updated" | "solved";

type WebhookRow = { id: string; name: string; events: string[]; target_url: string; active: boolean };
type DeliveryRow = { id: string; event_name: string; attempt: number; success: boolean; response_status: number | null; created_at: string };
type WebhookInspectionRow = { webhook_id: string; event_name: WebhookEvent; language: string; code: string };

function parseEventsCsv(csv: string): WebhookEvent[] {
  const allowed = new Set<WebhookEvent>(["created", "updated", "solved"]);
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is WebhookEvent => allowed.has(s as WebhookEvent));
}

export function WebhooksClient({ canWrite }: { canWrite: boolean }) {
  return <WebhooksClientInternal canWrite={canWrite} />;
}

function WebhooksClientInternal({ canWrite }: { canWrite: boolean }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [webhooks, setWebhooks] = React.useState<WebhookRow[]>([]);
  const [deliveries, setDeliveries] = React.useState<DeliveryRow[]>([]);
  const [inspections, setInspections] = React.useState<WebhookInspectionRow[]>([]);

  const [selectedWebhookId, setSelectedWebhookId] = React.useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = React.useState<WebhookEvent>("created");

  const [inspectionLanguage, setInspectionLanguage] = React.useState("json");
  const [inspectionCode, setInspectionCode] = React.useState("");

  // Webhook create form (server API route, so it works even when client-side writes are disabled).
  const [createName, setCreateName] = React.useState("My webhook");
  const [createEventsCsv, setCreateEventsCsv] = React.useState("created,updated,solved");
  const [createTargetUrl, setCreateTargetUrl] = React.useState("https://example.com/webhook");
  // Avoid `whsec_` prefix — GitHub secret scanning treats it like a Stripe webhook secret.
  const [createSecret, setCreateSecret] = React.useState("zengarden_demo_webhook_secret");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: w, error: wErr } = await supabase.from("webhooks").select("id,name,events,target_url,active").order("created_at", { ascending: false });
      if (wErr) throw wErr;
      const { data: d, error: dErr } = await supabase
        .from("webhook_deliveries")
        .select("id,event_name,attempt,success,response_status,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (dErr) throw dErr;
      const { data: i, error: iErr } = await supabase
        .from("webhook_inspections")
        .select("webhook_id,event_name,language,code")
        .order("updated_at", { ascending: false });
      if (iErr) throw iErr;
      setWebhooks((w ?? []) as WebhookRow[]);
      setDeliveries((d ?? []) as DeliveryRow[]);
      setInspections((i ?? []) as WebhookInspectionRow[]);

      // Keep current selection stable, but initialize if empty.
      if (!selectedWebhookId && (w ?? []).length > 0) {
        const first = (w as WebhookRow[])[0];
        if (first) {
          setSelectedWebhookId(first.id);
          const allowed = (first.events ?? []) as WebhookEvent[];
          setSelectedEvent((allowed.includes("created") ? "created" : allowed[0] ?? "created") as WebhookEvent);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedWebhook = React.useMemo(() => webhooks.find((w) => w.id === selectedWebhookId) ?? null, [webhooks, selectedWebhookId]);

  React.useEffect(() => {
    if (!selectedWebhook) return;
    const allowed = new Set<WebhookEvent>((selectedWebhook.events ?? []) as WebhookEvent[]);
    if (!allowed.has(selectedEvent)) {
      const fallback = (selectedWebhook.events ?? []).includes("created") ? "created" : ((selectedWebhook.events ?? [])[0] as WebhookEvent) ?? "created";
      setSelectedEvent(fallback);
    }
  }, [selectedWebhook, selectedEvent]);

  const currentInspection = React.useMemo(() => {
    if (!selectedWebhookId) return null;
    return inspections.find((i) => i.webhook_id === selectedWebhookId && i.event_name === selectedEvent) ?? null;
  }, [inspections, selectedEvent, selectedWebhookId]);

  React.useEffect(() => {
    if (!currentInspection) {
      setInspectionLanguage("json");
      setInspectionCode(DEFAULT_WEBHOOK_PAYLOAD_TEMPLATE);
      return;
    }
    setInspectionLanguage(currentInspection.language ?? "json");
    setInspectionCode(currentInspection.code ?? "");
  }, [currentInspection]);

  const previewExpanded = React.useMemo(() => {
    try {
      const raw = expandWebhookPayloadTemplate(
        inspectionCode.trim() || DEFAULT_WEBHOOK_PAYLOAD_TEMPLATE,
        selectedEvent,
        SAMPLE_TICKET_FOR_PREVIEW
      );
      const parsed = parseExpandedWebhookBody(raw);
      if (!parsed.ok) return `Invalid JSON after macro expansion: ${parsed.error}`;
      return JSON.stringify(parsed.value, null, 2);
    } catch (e) {
      return e instanceof Error ? e.message : "Preview failed";
    }
  }, [inspectionCode, selectedEvent]);

  async function createWebhook() {
    setError(null);
    if (!canWrite) {
      setError("Read-only mode: demo users cannot create webhooks.");
      return;
    }
    try {
      const events = parseEventsCsv(createEventsCsv);
      if (!createName.trim()) throw new Error("Name is required");
      if (!createTargetUrl.trim()) throw new Error("Target URL is required");
      if (!createSecret.trim()) throw new Error("Secret is required");
      if (!events.length) throw new Error("Pick at least one event");

      const res = await fetch("/api/v2/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          events,
          target_url: createTargetUrl.trim(),
          secret: createSecret.trim(),
          active: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create webhook");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    }
  }

  async function saveInspection() {
    setError(null);
    if (!selectedWebhookId) {
      setError("Select a webhook first.");
      return;
    }

    try {
      if (!canWrite) throw new Error("Read-only mode: demo users cannot save inspection snippets.");
      if (!inspectionCode.trim()) throw new Error("Payload template is required");

      const res = await fetch(`/api/v2/admin/webhooks/${selectedWebhookId}/inspection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: selectedEvent,
          language: inspectionLanguage || "json",
          code: inspectionCode
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to save inspection");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save inspection");
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Webhooks</h1>
          <p className="text-sm text-muted-foreground">Inspect delivery attempts and configure handlers from Admin.</p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Active webhooks</div>
          {webhooks.length ? (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="rounded border p-2 text-sm">
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{w.target_url}</div>
                  <div className="text-xs text-muted-foreground">Events: {w.events.join(", ")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No webhooks loaded.</div>
          )}

          {webhooks.length ? (
            <div className="mt-4 space-y-2">
              <Label>Selected webhook</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={selectedWebhookId ?? ""}
                onChange={(e) => setSelectedWebhookId(e.target.value)}
              >
                {webhooks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>

              <Label>Event</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value as WebhookEvent)}
              >
                {(((selectedWebhook?.events ?? []) as WebhookEvent[])).map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Delivery inspector (latest)</div>
          {deliveries.length ? (
            <div className="space-y-2">
              {deliveries.slice(0, 20).map((d) => (
                <div key={d.id} className="rounded border p-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">
                      {d.event_name} · attempt {d.attempt}
                    </div>
                    <div className={d.success ? "text-green-700" : "text-red-700"}>{d.success ? "OK" : "FAIL"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">HTTP: {d.response_status ?? "-"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No deliveries yet.</div>
          )}
          {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
        </Card>
      </div>

      <div className="mt-4">
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Webhook payload template (JSON + macros)</div>
          <div className="mb-3 space-y-2 text-sm text-muted-foreground">
            <p>
              This template becomes the <strong>HTTP POST body</strong> ZenGarden sends to your <code className="rounded bg-muted px-1">target_url</code> when
              the event fires. Use macros for ticket fields — each expands to a JSON literal (do <strong>not</strong> wrap macros in extra quotes).
            </p>
            <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs text-foreground">{WEBHOOK_PAYLOAD_MACRO_HELP}</pre>
          </div>

          {selectedWebhookId ? (
            <div className="grid gap-4 md:grid-cols-[1fr,380px]">
              <div className="space-y-3">
                <Label>Language label (optional)</Label>
                <Input value={inspectionLanguage} onChange={(e) => setInspectionLanguage(e.target.value)} placeholder="json" />
                <Label>Payload template</Label>
                <textarea
                  className="min-h-[280px] w-full rounded-md border border-border bg-background p-2 text-sm font-mono"
                  value={inspectionCode}
                  onChange={(e) => setInspectionCode(e.target.value)}
                  placeholder={DEFAULT_WEBHOOK_PAYLOAD_TEMPLATE}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setInspectionCode(DEFAULT_WEBHOOK_PAYLOAD_TEMPLATE)}
                    disabled={!canWrite}
                  >
                    Reset to default template
                  </Button>
                  <Button onClick={() => void saveInspection()} disabled={loading || !canWrite} className="flex-1 min-w-[12rem]">
                    Save payload template
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Preview (sample ticket + selected event)</div>
                <pre className="max-h-[min(60vh,420px)] overflow-auto rounded border bg-muted p-3 text-xs whitespace-pre-wrap">
                  {previewExpanded}
                </pre>
                <div className="text-xs text-muted-foreground">
                  Webhook: {selectedWebhook?.name ?? "-"} · Event: {selectedEvent}. Real deliveries use the live ticket from the database.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Create or select a webhook to edit the payload template.</div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Create webhook (live demo friendly)</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Events (comma separated)</Label>
              <Input value={createEventsCsv} onChange={(e) => setCreateEventsCsv(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target URL</Label>
              <Input value={createTargetUrl} onChange={(e) => setCreateTargetUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Secret</Label>
              <Input value={createSecret} onChange={(e) => setCreateSecret(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => void createWebhook()} disabled={loading || !canWrite} className="w-full">
            Create webhook
          </Button>
          <div className="text-xs text-muted-foreground">
            For a full demo, configure a webhook, then update tickets to trigger events and watch delivery attempts above.
          </div>
        </Card>
      </div>
    </div>
  );
}


"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { ZafBridge } from "@/components/apps/zaf-bridge";

type AppRow = {
  id: string;
  iframe_url: string;
  name: string;
  location: string;
  version: string;
};

export function AppIframeClient({ appId }: { appId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [app, setApp] = React.useState<AppRow | null>(null);
  const [iframeOrigin, setIframeOrigin] = React.useState<string | null>(null);

  const [ticketId, setTicketId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("ticketId");
    if (t) setTicketId(t);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: qErr } = await supabase.from("apps").select("*").eq("id", appId).maybeSingle();
        if (qErr) throw qErr;
        if (!data) throw new Error("App not found");
        if (!cancelled) {
          setApp(data as AppRow);
          try {
            const origin = new URL((data as AppRow).iframe_url).origin;
            setIframeOrigin(origin);
          } catch {
            setIframeOrigin(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load app");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const [userId, setUserId] = React.useState<string | null>(null);
  const [organizationId, setOrganizationId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data: row } = await supabase.from("users").select("organization_id").eq("id", u.user.id).maybeSingle();
        if (!cancelled) {
          setUserId(u.user.id);
          setOrganizationId(row?.organization_id ?? null);
        }
      } catch {
        // ignore; bridge context is best-effort
      }
    }
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{app?.name ?? "App"}</h1>
        <p className="text-sm text-muted-foreground">{app ? `v${app.version} · ${app.location}` : ""}</p>
      </div>

      <Card className="p-3">
        {loading ? <div className="text-sm text-muted-foreground">Loading app...</div> : null}
        {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}
        {app && !error ? (
          <div className="relative">
            {/* ZAF-like bridge listens for postMessage from the iframe and responds. */}
            <ZafBridge iframeOrigin={iframeOrigin} context={{ ticketId, userId, organizationId }} />

            <iframe
              title={app.name}
              src={app.iframe_url}
              className="h-[70vh] w-full rounded-md border"
              sandbox="allow-scripts allow-forms allow-same-origin"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}


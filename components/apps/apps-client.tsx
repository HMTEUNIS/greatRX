"use client";

import * as React from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type AppRow = { id: string; name: string; version: string; location: string; iframe_url: string };

export function AppsClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [apps, setApps] = React.useState<AppRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: qErr } = await supabase.from("apps").select("id,name,version,location,iframe_url").order("created_at", { ascending: false });
        if (qErr) throw qErr;
        if (!cancelled) setApps((data ?? []) as AppRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load apps");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Apps</h1>
        <p className="text-sm text-muted-foreground">Open installed apps in a sandboxed iframe.</p>
      </div>

      <Card className="p-4">
        {loading ? <div className="text-sm text-muted-foreground">Loading apps...</div> : null}
        {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}
        {!loading && !error ? (
          apps.length ? (
            <div className="space-y-2">
              {apps.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded border p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      v{a.version} · {a.location}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="secondary">
                      <Link href={`/apps/${a.id}`}>Open</Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link href={`/apps/${a.id}/settings`}>Settings</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No apps installed yet.</div>
          )
        ) : null}
      </Card>
    </div>
  );
}


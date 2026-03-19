"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TicketPriority, TicketStatus } from "@/lib/tickets/types";
import { isLiveDemoModeClient } from "@/lib/runtime/live-demo";

export type Ticket = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  requester_id: string | null;
  assignee_id: string | null;
  updated_at: string | null;
};

export function TicketsClient() {
  const router = useRouter();
  const liveDemoMode = isLiveDemoModeClient();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [view, setView] = React.useState<"my" | "unassigned" | "all">("my");

  async function loadTickets(currentView: "my" | "unassigned" | "all") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/tickets?view=${encodeURIComponent(currentView)}`, { method: "GET" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load tickets");
      setTickets((data.tickets ?? []) as Ticket[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadTickets(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function seedDemo() {
    if (liveDemoMode) {
      setError("Live demo mode enabled: demo writes are disabled.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
      const res = await fetch(`${supabaseUrl}/functions/v1/demo-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Seed failed");
      // Refresh
      await loadTickets(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {view === "my" ? "My Tickets" : view === "unassigned" ? "Unassigned" : "All Tickets"}
          </h1>
          <p className="text-sm text-muted-foreground">Ticket sandbox for Zendesk app development.</p>
          {liveDemoMode ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Live demo mode is ON (writes disabled).
            </p>
          ) : null}
        </div>
        <Button onClick={() => void seedDemo()} disabled={loading || liveDemoMode}>
          Seed demo
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <Button variant={view === "my" ? "default" : "secondary"} onClick={() => setView("my")} disabled={loading}>
          My Tickets
        </Button>
        <Button
          variant={view === "unassigned" ? "default" : "secondary"}
          onClick={() => setView("unassigned")}
          disabled={loading}
        >
          Unassigned
        </Button>
        <Button variant={view === "all" ? "default" : "secondary"} onClick={() => setView("all")} disabled={loading}>
          All
        </Button>
      </div>

      <Card className="p-4">
        {loading ? <div className="text-sm text-muted-foreground">Loading tickets...</div> : null}
        {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}
        {!loading && !error ? (
          tickets.length ? (
            <div className="space-y-2">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded border p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.status} · {t.priority}</div>
                  </div>
                  <Button variant="secondary" onClick={() => router.push(`/tickets/${t.id}`)}>
                    View
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No tickets yet. Seed demo mode to get started.</div>
          )
        ) : null}
      </Card>
    </div>
  );
}


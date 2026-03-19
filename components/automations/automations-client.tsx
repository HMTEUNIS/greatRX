"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AutomationRuleRow = { id: string; name: string; trigger_event: string; is_active: boolean; condition: any; actions: any };
type TicketRow = { id: string; status: string };

export function AutomationsClient() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rules, setRules] = React.useState<AutomationRuleRow[]>([]);
  const [tickets, setTickets] = React.useState<TicketRow[]>([]);

  async function refresh() {
    setError(null);
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: r, error: rErr } = await supabase.from("automation_rules").select("*").order("created_at", { ascending: false });
      if (rErr) throw rErr;
      setRules((r ?? []) as AutomationRuleRow[]);

      const { data: t, error: tErr } = await supabase.from("tickets").select("id,status").order("updated_at", { ascending: false }).limit(20);
      if (tErr) throw tErr;
      setTickets((t ?? []) as TicketRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations");
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstRule = rules[0] ?? null;

  async function triggerRuleOnTicket(rule: AutomationRuleRow, ticketId: string) {
    setError(null);
    setBusy(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, event_name: rule.trigger_event })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Automation trigger failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Automation trigger failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Automations</h1>
        <p className="text-sm text-muted-foreground">Define rules in Admin to simulate Zendesk-like automations.</p>
      </div>

      {error ? <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Rules</div>
          {rules.length ? (
            <div className="space-y-2">
              {rules.slice(0, 20).map((r) => (
                <div key={r.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">Trigger: {r.trigger_event}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No automation rules loaded.</div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Trigger simulation</div>
          <div className="text-sm text-muted-foreground mb-3">Pick a ticket and trigger the first rule (read-only UI).</div>
          {firstRule && tickets.length ? (
            <div className="space-y-2">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.id}</div>
                    <div className="text-xs text-muted-foreground">Status: {t.status}</div>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy || !firstRule.is_active}
                    onClick={() => void triggerRuleOnTicket(firstRule, t.id)}
                  >
                    Trigger
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No tickets/rules available.</div>
          )}
        </Card>
      </div>
    </div>
  );
}


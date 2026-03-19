"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TicketPriority, TicketStatus } from "@/lib/tickets/types";
import { isLiveDemoModeClient } from "@/lib/runtime/live-demo";
import { LogoutButton } from "@/components/auth/logout-button";

export type Ticket = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  requester_id: string | null;
  assignee_id: string | null;
  updated_at: string | null;
};

export function TicketsClient({ canSeed }: { canSeed: boolean }) {
  const router = useRouter();
  const liveDemoMode = isLiveDemoModeClient();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [view, setView] = React.useState<"my" | "unassigned" | "all">("my");
  const canWrite = canSeed;
  const [success, setSuccess] = React.useState<{ message: string; ticketId: string } | null>(null);

  const [supportSubject, setSupportSubject] = React.useState("");
  const [supportMessage, setSupportMessage] = React.useState("");
  const [supportPriority, setSupportPriority] = React.useState<TicketPriority>("normal");
  const [creatingSupport, setCreatingSupport] = React.useState(false);

  const [emailFrom, setEmailFrom] = React.useState("customer@example.com");
  const [emailTo, setEmailTo] = React.useState("support@zengarden.dummy");
  const [emailSubject, setEmailSubject] = React.useState("");
  const [emailBody, setEmailBody] = React.useState("");
  const [creatingEmail, setCreatingEmail] = React.useState(false);

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
    setSuccess(null);
    if (liveDemoMode) {
      setError("Live demo mode enabled: demo writes are disabled.");
      return;
    }
    if (!canSeed) {
      setError("Read-only: demo users cannot seed data.");
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

  async function submitSupportForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!canWrite) {
      setError("Read-only: demo users cannot submit support forms.");
      return;
    }
    if (!supportSubject.trim() || !supportMessage.trim()) {
      setError("Support form requires subject and message.");
      return;
    }

    setCreatingSupport(true);
    try {
      const res = await fetch("/api/v2/tickets/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "support_form",
          subject: supportSubject.trim(),
          message: supportMessage.trim(),
          priority: supportPriority
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create support ticket");

      setSupportSubject("");
      setSupportMessage("");
      setSupportPriority("normal");
      setSuccess({
        message: "Support form submitted and ticket created.",
        ticketId: String(data?.ticket_id ?? "")
      });
      await loadTickets(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create support ticket");
    } finally {
      setCreatingSupport(false);
    }
  }

  async function submitEmailMock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!canWrite) {
      setError("Read-only: demo users cannot submit mock email tickets.");
      return;
    }
    if (!emailFrom.trim() || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      setError("Email mock requires from/to/subject/body.");
      return;
    }

    setCreatingEmail(true);
    try {
      const res = await fetch("/api/v2/tickets/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "email_mock",
          from_email: emailFrom.trim(),
          to_email: emailTo.trim(),
          subject: emailSubject.trim(),
          body_text: emailBody.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create mock email ticket");

      setEmailSubject("");
      setEmailBody("");
      setSuccess({
        message: "Mock email submitted and ticket created.",
        ticketId: String(data?.ticket_id ?? "")
      });
      await loadTickets(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mock email ticket");
    } finally {
      setCreatingEmail(false);
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
          {!liveDemoMode && !canSeed ? (
            <p className="mt-1 text-xs text-muted-foreground">Read-only account: `Seed demo` is for admin/agent.</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void seedDemo()} disabled={loading || liveDemoMode}>
            Seed demo
          </Button>
          <LogoutButton className="h-10" />
        </div>
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

      <div id="ticket-intake" className="mb-2 scroll-mt-6">
        <div className="text-sm font-medium">Ticket Intake</div>
        <div className="text-xs text-muted-foreground">
          Use these inputs to create backend tickets and trigger existing webhook/automation events.
        </div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Support Form (mock)</div>
          <form className="space-y-3" onSubmit={submitSupportForm}>
            <div className="space-y-2">
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                placeholder="Support request subject"
                disabled={creatingSupport || !canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-message">Message</Label>
              <textarea
                id="support-message"
                className="min-h-[100px] w-full rounded-md border border-border bg-background p-2 text-sm"
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Describe the issue..."
                disabled={creatingSupport || !canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-priority">Priority</Label>
              <select
                id="support-priority"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={supportPriority}
                onChange={(e) => setSupportPriority(e.target.value as TicketPriority)}
                disabled={creatingSupport || !canWrite}
              >
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </div>
            <Button type="submit" disabled={creatingSupport || !canWrite} className="w-full">
              {creatingSupport ? "Submitting..." : "Submit support form"}
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Email Ticket (mock)</div>
          <form className="space-y-3" onSubmit={submitEmailMock}>
            <div className="space-y-2">
              <Label htmlFor="email-from">From email</Label>
              <Input
                id="email-from"
                type="email"
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                disabled={creatingEmail || !canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-to">To email</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                disabled={creatingEmail || !canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject"
                disabled={creatingEmail || !canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-body">Body</Label>
              <textarea
                id="email-body"
                className="min-h-[100px] w-full rounded-md border border-border bg-background p-2 text-sm"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Raw email body..."
                disabled={creatingEmail || !canWrite}
              />
            </div>
            <Button type="submit" disabled={creatingEmail || !canWrite} className="w-full">
              {creatingEmail ? "Submitting..." : "Submit mock email"}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="p-4">
        {loading ? <div className="text-sm text-muted-foreground">Loading tickets...</div> : null}
        {success ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            <div>{success.message}</div>
            {success.ticketId ? (
              <Button variant="secondary" onClick={() => router.push(`/tickets/${success.ticketId}`)}>
                View ticket
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 space-y-2">
            <div>{error}</div>
            {error.toLowerCase().includes("no organization") ? (
              <div className="text-xs text-red-700/80">
                Your Auth user exists, but it is not mapped to an organization in <code>public.users</code>.
                Re-run <code>supabase/seed_demo_users.sql</code> (make sure the emails match), then refresh.
                If you are trying to seed data, log in as <code>admin@zengarden.dummy</code> or <code>agent@zengarden.dummy</code>.
              </div>
            ) : null}
          </div>
        ) : null}
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


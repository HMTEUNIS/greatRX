"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { TicketPriority, TicketStatus } from "@/lib/tickets/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ReplySchema = z.object({
  body: z.string().min(1).max(20_000),
  is_internal: z.boolean()
});

type TicketPayload = {
  id: string;
  subject: string;
  description: string;
  type: string;
  status: TicketStatus;
  priority: TicketPriority;
  tags: string[] | null;
  requester_id: string | null;
  assignee_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CommentPayload = {
  id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
};

export function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [ticket, setTicket] = React.useState<TicketPayload | null>(null);
  const [comments, setComments] = React.useState<CommentPayload[]>([]);

  const [replyBody, setReplyBody] = React.useState("");
  const [isInternal, setIsInternal] = React.useState(false);
  const [savingReply, setSavingReply] = React.useState(false);

  const [statusSaving, setStatusSaving] = React.useState(false);
  const [statusDraft, setStatusDraft] = React.useState<TicketStatus>("new");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/tickets/${ticketId}`, { method: "GET" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Failed to load ticket");
      setTicket(data.ticket as TicketPayload);
      setComments((data.comments ?? []) as CommentPayload[]);
      setStatusDraft(data.ticket.status as TicketStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = ReplySchema.safeParse({ body: replyBody, is_internal: isInternal });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid reply");
      return;
    }

    setSavingReply(true);
    try {
      const response = await fetch(`/api/v2/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: parsed.data.body, is_internal: parsed.data.is_internal })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Failed to add comment");
      setReplyBody("");
      setIsInternal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setSavingReply(false);
    }
  }

  async function updateStatus() {
    if (!ticket) return;
    setStatusSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusDraft })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Failed to update status");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="secondary" onClick={() => router.push("/tickets")}>
          Back
        </Button>
        <div>
          <div className="text-xl font-semibold">{ticket?.subject ?? "Ticket"}</div>
          <div className="text-sm text-muted-foreground">
            {ticket ? `${ticket.status} · ${ticket.priority}` : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr,360px]">
        <Card className="p-4">
          {loading ? <div className="text-sm text-muted-foreground">Loading...</div> : null}
          {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}

          {!loading && ticket ? (
            <>
              <div className="mb-3 rounded border p-3 text-sm">
                <div className="text-muted-foreground">Description</div>
                <div className="whitespace-pre-wrap">{ticket.description}</div>
              </div>

              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="rounded border p-3">
                    <div className="mb-1 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString()} · {c.is_internal ? "Internal note" : "Reply"}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
                {!comments.length ? <div className="text-sm text-muted-foreground">No comments yet.</div> : null}
              </div>
            </>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="space-y-3">
            <div className="text-sm font-medium">Status</div>
            <div className="space-y-2">
              <Label htmlFor="status">Workflow</Label>
              <select
                id="status"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as TicketStatus)}
                disabled={statusSaving}
              >
                <option value="new">new</option>
                <option value="open">open</option>
                <option value="pending">pending</option>
                <option value="solved">solved</option>
                <option value="closed">closed</option>
              </select>
              <Button onClick={() => void updateStatus()} disabled={statusSaving} className="w-full">
                {statusSaving ? "Updating..." : "Update status"}
              </Button>
            </div>

            <hr />

            <form className="space-y-3" onSubmit={submitReply}>
              <div className="text-sm font-medium">Add reply / note</div>
              <div className="flex items-center gap-2">
                <input id="internal" type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                <Label htmlFor="internal">Internal note</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reply">Message</Label>
                <Input
                  id="reply"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={isInternal ? "Internal note..." : "Reply to requester..."}
                />
                <div className="text-xs text-muted-foreground">Tip: Use new ticket creation + replies to test webhooks/automation.</div>
              </div>

              <Button type="submit" disabled={savingReply} className="w-full">
                {savingReply ? "Sending..." : "Send"}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}


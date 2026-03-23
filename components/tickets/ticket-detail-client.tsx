"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { TicketPriority, TicketStatus } from "@/lib/tickets/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  author_role?: string | null;
};

function formatWhen(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TicketDetailClient({ ticketId, canWrite }: { ticketId: string; canWrite: boolean }) {
  const router = useRouter();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [ticket, setTicket] = React.useState<TicketPayload | null>(null);
  const [comments, setComments] = React.useState<CommentPayload[]>([]);

  const [replyBody, setReplyBody] = React.useState("");
  const [isInternal, setIsInternal] = React.useState(false);
  const [savingReply, setSavingReply] = React.useState(false);

  const [statusSaving, setStatusSaving] = React.useState(false);
  const [statusDraft, setStatusDraft] = React.useState<TicketStatus>("new");
  const readOnly = !canWrite;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/tickets/${ticketId}`, { method: "GET" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Failed to load ticket");
      setTicket(data.ticket as TicketPayload);
      setComments(Array.isArray(data.comments) ? (data.comments as CommentPayload[]) : []);
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

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [ticket, comments, loading]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (readOnly) {
      setError("Read-only mode: cannot add replies/notes.");
      return;
    }
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
    if (readOnly) {
      setError("Read-only mode: cannot update status.");
      return;
    }
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
    <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push("/tickets")}>
            Back
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight">{ticket?.subject ?? "Ticket"}</h1>
            <p className="text-sm text-muted-foreground">
              {ticket ? `${ticket.status} · ${ticket.priority}` : loading ? "Loading…" : ""}
            </p>
          </div>
        </div>

        <Card className="flex min-h-[min(70vh,720px)] flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading conversation…</div>
          ) : null}
          {error ? (
            <div className="m-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          {!loading && ticket ? (
            <>
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
                aria-label="Ticket conversation"
              >
                <div className="flex justify-start">
                  <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-tl-md border border-border bg-muted/80 px-4 py-3 shadow-sm">
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Original request · {formatWhen(ticket.created_at)}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {ticket.description?.trim() ? ticket.description : "—"}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Replies &amp; notes
                    {comments.length > 0 ? (
                      <span className="ml-1.5 font-normal normal-case text-muted-foreground/80">({comments.length})</span>
                    ) : null}
                  </div>
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No ticket comments yet — add a reply below.</p>
                  ) : null}
                </div>

                {comments.map((c) => {
                  const roleLabel = c.author_role ? ` · ${c.author_role}` : "";

                  if (c.is_internal) {
                    return (
                      <div key={c.id} className="flex justify-center px-1">
                        <div className="max-w-[min(100%,40rem)] rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-4 py-2.5 text-sm shadow-sm">
                          <div className="mb-1 text-xs font-medium text-amber-900/80 dark:text-amber-200/90">
                            Internal note{roleLabel} · {formatWhen(c.created_at)}
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed">{c.body}</div>
                        </div>
                      </div>
                    );
                  }

                  const fromRequester =
                    ticket.requester_id != null && c.author_id === ticket.requester_id;

                  const who = fromRequester ? "Customer" : `Team${roleLabel}`;

                  return (
                    <div key={c.id} className={`flex ${fromRequester ? "justify-start" : "justify-end"}`}>
                      <div
                        className={[
                          "max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm shadow-sm",
                          fromRequester
                            ? "rounded-tl-md border border-border bg-muted/80"
                            : "rounded-tr-md bg-primary text-primary-foreground"
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "mb-1.5 text-xs font-medium",
                            fromRequester ? "text-muted-foreground" : "text-primary-foreground/80"
                          ].join(" ")}
                        >
                          {who} · {formatWhen(c.created_at)}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">{c.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <form className="space-y-3" onSubmit={submitReply}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        id="internal"
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        disabled={savingReply || readOnly}
                      />
                      <Label htmlFor="internal" className="text-sm font-normal">
                        Internal note
                      </Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reply" className="sr-only">
                      Message
                    </Label>
                    <textarea
                      id="reply"
                      rows={3}
                      className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder={isInternal ? "Internal note (visible to team only)…" : "Reply to customer…"}
                      disabled={savingReply || readOnly}
                    />
                  </div>
                  <Button type="submit" disabled={savingReply || readOnly} className="w-full sm:w-auto">
                    {savingReply ? "Sending…" : "Send"}
                  </Button>
                </form>
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <Card className="h-fit w-full shrink-0 space-y-3 p-4 lg:w-72">
        <div className="text-sm font-medium">Status</div>
        <div className="space-y-2">
          <Label htmlFor="status">Workflow</Label>
          <select
            id="status"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value as TicketStatus)}
            disabled={statusSaving || readOnly}
          >
            <option value="new">new</option>
            <option value="open">open</option>
            <option value="pending">pending</option>
            <option value="solved">solved</option>
            <option value="closed">closed</option>
          </select>
          <Button type="button" onClick={() => void updateStatus()} disabled={statusSaving || readOnly} className="w-full">
            {statusSaving ? "Updating…" : "Update status"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

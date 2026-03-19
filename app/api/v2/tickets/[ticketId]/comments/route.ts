import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api/require-auth";
import { dispatchTicketEventToAutomation, dispatchTicketEventToWebhooks, type TicketEvent } from "@/lib/webhooks/dispatch";
import type { TicketStatus } from "@/lib/tickets/types";

const AddCommentSchema = z.object({
  body: z.string().min(1).max(20_000),
  is_internal: z.boolean().optional().default(false)
});

export async function POST(req: Request, { params }: { params: { ticketId: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = AddCommentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });

  const supabase = getSupabaseServerClient();

  const { data: me } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { data: ticket, error: tErr } = await supabase
    .from("tickets")
    .select("id,status")
    .eq("id", params.ticketId)
    .eq("organization_id", me.organization_id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: insertErr } = await supabase.from("ticket_comments").insert({
    organization_id: me.organization_id,
    ticket_id: params.ticketId,
    author_id: auth.user.id,
    body: parsed.data.body,
    is_internal: parsed.data.is_internal
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 403 });
  }

  // If the ticket is new, Zendesk-like behavior typically opens it on first external reply.
  if (ticket.status === "new") {
    const { error: updErr } = await supabase.from("tickets").update({ status: "open" }).eq("id", params.ticketId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 403 });
    }
  }

  const event: TicketEvent = ticket.status === "new" ? "updated" : "updated";
  await dispatchTicketEventToWebhooks({ organizationId: me.organization_id, ticketId: params.ticketId, event });
  await dispatchTicketEventToAutomation({ ticketId: params.ticketId, event });

  return NextResponse.json({ ok: true }, { status: 201 });
}


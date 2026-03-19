import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api/require-auth";
import { dispatchTicketEventToAutomation, dispatchTicketEventToWebhooks, type TicketEvent } from "@/lib/webhooks/dispatch";
import { inferTicketEventFromUpdate, isAllowedStatusTransition } from "@/lib/tickets/workflow";
import type { TicketPriority, TicketStatus } from "@/lib/tickets/types";

const TicketStatusSchema = z.enum(["new", "open", "pending", "solved", "closed"]);
const TicketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

const UpdateTicketSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  description: z.string().max(20_000).optional(),
  type: z.string().max(100).optional(),
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  assignee_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional()
});

export async function GET(_: Request, { params }: { params: { ticketId: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabaseServerClient();
  const { data: me } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("id,subject,description,type,status,priority,tags,requester_id,assignee_id,created_at,updated_at")
    .eq("id", params.ticketId)
    .eq("organization_id", me.organization_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: comments } = await supabase
    .from("ticket_comments")
    .select("id,author_id,body,is_internal,created_at")
    .eq("ticket_id", params.ticketId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ticket, comments: comments ?? [] }, { status: 200 });
}

export async function PATCH(req: Request, { params }: { params: { ticketId: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = UpdateTicketSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { data: me, error: meErr } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { data: existing, error: exErr } = await supabase
    .from("tickets")
    .select("id,status")
    .eq("id", params.ticketId)
    .eq("organization_id", me.organization_id)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  if (parsed.data.subject !== undefined) {
    updates.subject = parsed.data.subject;
    updatedFields.push("subject");
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
    updatedFields.push("description");
  }
  if (parsed.data.type !== undefined) {
    updates.type = parsed.data.type;
    updatedFields.push("type");
  }
  if (parsed.data.priority !== undefined) {
    updates.priority = parsed.data.priority satisfies TicketPriority;
    updatedFields.push("priority");
  }
  if (parsed.data.assignee_id !== undefined) {
    updates.assignee_id = parsed.data.assignee_id ?? null;
    updatedFields.push("assignee_id");
  }
  if (parsed.data.tags !== undefined) {
    updates.tags = parsed.data.tags;
    updatedFields.push("tags");
  }

  if (parsed.data.status !== undefined) {
    const from = existing.status as TicketStatus;
    const to = parsed.data.status as TicketStatus;
    if (from !== to) {
      if (!isAllowedStatusTransition(from, to)) {
        return NextResponse.json(
          { error: `Invalid status transition ${from} -> ${to}` },
          { status: 400 }
        );
      }
      updates.status = to;
      updatedFields.push("status");
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  const { error: updErr } = await supabase.from("tickets").update(updates).eq("id", params.ticketId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const { data: after } = await supabase.from("tickets").select("id,status").eq("id", params.ticketId).maybeSingle();
  if (!after) return NextResponse.json({ error: "Reload failed" }, { status: 500 });

  const event: TicketEvent = inferTicketEventFromUpdate(
    { status: existing.status as TicketStatus },
    { status: after.status as TicketStatus },
    updatedFields
  );

  await dispatchTicketEventToWebhooks({ organizationId: me.organization_id, ticketId: params.ticketId, event });
  await dispatchTicketEventToAutomation({ ticketId: params.ticketId, event });

  return NextResponse.json({ ok: true, event }, { status: 200 });
}


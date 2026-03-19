import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api/require-auth";
import { dispatchTicketEventToAutomation, dispatchTicketEventToWebhooks, type TicketEvent } from "@/lib/webhooks/dispatch";
import type { TicketPriority, TicketStatus } from "@/lib/tickets/types";

const TicketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const TicketStatusSchema = z.enum(["new", "open", "pending", "solved", "closed"]);

const CreateTicketSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().max(20_000).optional().default(""),
  type: z.string().max(100).optional().default("question"),
  priority: TicketPrioritySchema.optional().default("normal"),
  assignee_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional().default([])
});

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const view = (url.searchParams.get("view") ?? "my") as "my" | "unassigned" | "all";
  const status = url.searchParams.get("status") as TicketStatus | null;

  const supabase = getSupabaseServerClient();
  const { data: me } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  let q = supabase.from("tickets").select("id,subject,status,priority,requester_id,assignee_id,created_at,updated_at");
  if (status) q = q.eq("status", status);
  q = q.eq("organization_id", me.organization_id).order("updated_at", { ascending: false }).limit(100);

  if (view === "my") {
    q = q.or(`requester_id.eq.${auth.user.id},assignee_id.eq.${auth.user.id}`);
  } else if (view === "unassigned") {
    q = q.is("assignee_id", null);
  } else if (view !== "all") {
    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data ?? [] }, { status: 200 });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { data: me, error: meErr } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const assignee_id = parsed.data.assignee_id ?? null;

  const { data: created, error: cErr } = await supabase
    .from("tickets")
    .insert({
      organization_id: me.organization_id,
      subject: parsed.data.subject,
      description: parsed.data.description,
      type: parsed.data.type,
      status: "new",
      priority: parsed.data.priority satisfies TicketPriority,
      tags: parsed.data.tags,
      requester_id: auth.user.id,
      assignee_id
    })
    .select("id, status");

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const ticketId = created?.[0]?.id;
  if (!ticketId) return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });

  // Side effects
  const event: TicketEvent = "created";
  await dispatchTicketEventToWebhooks({ organizationId: me.organization_id, ticketId, event });
  await dispatchTicketEventToAutomation({ ticketId, event });

  return NextResponse.json({ ticket_id: ticketId }, { status: 201 });
}


import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api/require-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { dispatchTicketEventToAutomation, dispatchTicketEventToWebhooks, type TicketEvent } from "@/lib/webhooks/dispatch";
import type { TicketPriority } from "@/lib/tickets/types";

const SupportFormSchema = z.object({
  channel: z.literal("support_form"),
  subject: z.string().min(1).max(500),
  message: z.string().min(1).max(20_000),
  type: z.string().max(100).optional().default("question"),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  tags: z.array(z.string()).optional().default([])
});

const EmailMockSchema = z.object({
  channel: z.literal("email_mock"),
  from_email: z.string().email().max(320),
  to_email: z.string().email().max(320),
  subject: z.string().min(1).max(500),
  body_text: z.string().min(1).max(20_000),
  provider_message_id: z.string().max(500).optional().nullable()
});

const IntakeSchema = z.union([SupportFormSchema, EmailMockSchema]);

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", auth.user.id)
    .single();

  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });
  if (me.role === "demo") {
    return NextResponse.json({ error: "Read-only: demo users cannot create tickets." }, { status: 403 });
  }

  const intake = parsed.data;

  const ticketInsert =
    intake.channel === "support_form"
      ? {
          organization_id: me.organization_id,
          subject: intake.subject,
          description: intake.message,
          type: intake.type,
          status: "new" as const,
          priority: intake.priority satisfies TicketPriority,
          tags: intake.tags,
          requester_id: auth.user.id,
          assignee_id: null
        }
      : {
          organization_id: me.organization_id,
          subject: intake.subject,
          description: intake.body_text,
          type: "question",
          status: "new" as const,
          priority: "normal" satisfies TicketPriority,
          tags: ["email-mock"],
          requester_id: auth.user.id,
          assignee_id: null
        };

  const { data: createdTicket, error: cErr } = await supabase
    .from("tickets")
    .insert(ticketInsert)
    .select("id, status")
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!createdTicket?.id) return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });

  // For email-mock channel, also insert thread/message + external comment.
  if (intake.channel === "email_mock") {
    const threadKey = `ticket:${createdTicket.id}`;
    const { data: createdThread, error: threadErr } = await supabase
      .from("email_threads")
      .insert({
        organization_id: me.organization_id,
        ticket_id: createdTicket.id,
        thread_key: threadKey
      })
      .select("id")
      .maybeSingle();
    if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 500 });
    if (!createdThread?.id) return NextResponse.json({ error: "Failed to create email thread" }, { status: 500 });

    const { error: msgErr } = await supabase.from("email_messages").insert({
      organization_id: me.organization_id,
      thread_id: createdThread.id,
      direction: "in",
      provider_message_id: intake.provider_message_id ?? null,
      from_email: intake.from_email.toLowerCase(),
      to_email: intake.to_email.toLowerCase(),
      subject: intake.subject,
      body_text: intake.body_text
    });
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    const { error: commentErr } = await supabase.from("ticket_comments").insert({
      organization_id: me.organization_id,
      ticket_id: createdTicket.id,
      author_id: auth.user.id,
      body: intake.body_text,
      is_internal: false
    });
    if (commentErr) return NextResponse.json({ error: commentErr.message }, { status: 500 });
  }

  const event: TicketEvent = "created";
  await dispatchTicketEventToWebhooks({ organizationId: me.organization_id, ticketId: createdTicket.id, event });
  await dispatchTicketEventToAutomation({ ticketId: createdTicket.id, event });

  return NextResponse.json(
    { ok: true, ticket_id: createdTicket.id, channel: intake.channel },
    { status: 201 }
  );
}


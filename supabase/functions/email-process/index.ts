import { serve } from "https://deno.land/std/http/server.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";

type EmailProcessRequest = {
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  provider_message_id?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function stripRePrefix(subject: string) {
  return subject.replace(/^(\s*Re:\s*)+/i, "").trim();
}

function parseTicketIdFromSubject(subject: string): string | null {
  // Support formats like: "Re: [#<uuid>] <subject>" or "[#<uuid>] <subject>"
  const cleaned = stripRePrefix(subject);
  const match = cleaned.match(/\[#([0-9a-fA-F-]{36})\]/);
  return match?.[1] ?? null;
}

async function findUserIdByEmail(supabase: any, email: string, orgId: string) {
  // Public.users doesn't store email; use auth admin to locate auth.users, then map to public.users row.
  const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
  const hit = (users ?? []).find((u: any) => normalizeEmail(u.email) === normalizeEmail(email));
  const authUserId = hit?.id as string | undefined;
  if (!authUserId) return null;
  const { data: publicUser, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", authUserId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return null;
  return publicUser?.id ?? null;
}

async function dispatchEventToAutomationAndWebhooks(params: {
  supabaseUrl: string;
  organizationId: string;
  ticketId: string;
  event_name: "created" | "updated" | "solved";
}) {
  const supabase = getSupabaseAdminClient();

  // Run automation engine.
  const automationFnUrl = `${params.supabaseUrl}/functions/v1/automation-execute`;
  await fetch(automationFnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_id: params.ticketId, event_name: params.event_name })
  });

  // Deliver webhooks.
  const fnUrl = `${params.supabaseUrl}/functions/v1/webhook-deliver`;
  const { data: webhooks, error } = await supabase
    .from("webhooks")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("active", true)
    .contains("events", [params.event_name]);
  if (error) throw error;

  await Promise.all(
    (webhooks ?? []).map((wh) =>
      fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_id: wh.id, event_name: params.event_name, payload: { ticket_id: params.ticketId } })
      })
    )
  );
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const liveDemo = Deno.env.get("LIVE_DEMO_MODE") === "true";
    if (liveDemo) return jsonResponse({ error: "Live demo mode enabled: email processing disabled." }, 403);
    const body = (await req.json().catch(() => null)) as EmailProcessRequest | null;
    if (!body?.from_email || !body?.to_email || !body?.subject) return jsonResponse({ error: "Missing email fields" }, 400);

    const supabase = getSupabaseAdminClient();
    const fromEmail = normalizeEmail(body.from_email);
    const toEmail = normalizeEmail(body.to_email);
    const subject = stripRePrefix(body.subject);

    const { data: emailCfg, error: cfgErr } = await supabase
      .from("email_config")
      .select("organization_id")
      .eq("support_email", toEmail)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!emailCfg) return jsonResponse({ error: "No email_config for support_email" }, 404);

    const orgId = emailCfg.organization_id as string;

    const ticketId = parseTicketIdFromSubject(body.subject);

    // Resolve requester user id.
    const requesterId = await findUserIdByEmail(supabase, fromEmail, orgId);
    // Fallback: pick any agent user in org.
    let resolvedRequesterId = requesterId;
    if (!resolvedRequesterId) {
      const { data: fallback } = await supabase
        .from("users")
        .select("id")
        .eq("organization_id", orgId)
        .eq("role", "agent")
        .limit(1);
      resolvedRequesterId = fallback?.[0]?.id ?? null;
    }

    if (!resolvedRequesterId) return jsonResponse({ error: "No requester user available in organization" }, 400);

    // Ensure email thread and store inbound message.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    if (ticketId) {
      const { data: ticket, error: tErr } = await supabase
        .from("tickets")
        .select("id, organization_id, status")
        .eq("id", ticketId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!ticket) return jsonResponse({ error: "Ticket not found" }, 404);

      // Create thread keyed by ticket.
      const threadKey = `ticket:${ticketId}`;
      const { data: thread, error: thrErr } = await supabase
        .from("email_threads")
        .select("id")
        .eq("thread_key", threadKey)
        .maybeSingle();
      if (thrErr) throw thrErr;
      let threadId = thread?.id as string | undefined;
      if (!threadId) {
        const { data: createdThread, error: createdThrErr } = await supabase
          .from("email_threads")
          .insert({ organization_id: orgId, ticket_id: ticketId, thread_key: threadKey })
          .select("id")
          .maybeSingle();
        if (createdThrErr) throw createdThrErr;
        threadId = createdThread?.id;
      }
      if (!threadId) throw new Error("Failed to create/resolve email thread");

      // Store inbound email.
      await supabase.from("email_messages").insert({
        organization_id: orgId,
        thread_id: threadId,
        direction: "in",
        provider_message_id: body.provider_message_id ?? null,
        from_email: fromEmail,
        to_email: toEmail,
        subject: subject,
        body_text: body.body_text ?? ""
      });

      // Append ticket comment and move ticket to open if needed.
      await supabase.from("ticket_comments").insert({
        organization_id: orgId,
        ticket_id: ticketId,
        author_id: resolvedRequesterId,
        body: body.body_text ?? "",
        is_internal: false
      });

      if (ticket.status === "new") {
        await supabase.from("tickets").update({ status: "open" }).eq("id", ticketId);
      }

      await dispatchEventToAutomationAndWebhooks({
        supabaseUrl,
        organizationId: orgId,
        ticketId,
        event_name: "updated"
      });

      return jsonResponse({ ok: true, action: "reply", ticket_id: ticketId });
    }

    // Create new ticket.
    const { data: createdTicket, error: cErr } = await supabase
      .from("tickets")
      .insert({
        organization_id: orgId,
        subject: subject || "(no subject)",
        description: body.body_text ?? "",
        status: "new",
        priority: "normal",
        tags: [],
        type: "question",
        requester_id: resolvedRequesterId,
        assignee_id: null
      })
      .select("id, status")
      .maybeSingle();
    if (cErr) throw cErr;
    const newTicketId = createdTicket?.id as string | undefined;
    if (!newTicketId) throw new Error("Failed to create ticket");

    // Create thread.
    const threadKey = `ticket:${newTicketId}`;
    const { data: createdThread, error: thrErr } = await supabase
      .from("email_threads")
      .insert({ organization_id: orgId, ticket_id: newTicketId, thread_key: threadKey })
      .select("id")
      .maybeSingle();
    if (thrErr) throw thrErr;

    await supabase.from("email_messages").insert({
      organization_id: orgId,
      thread_id: createdThread?.id,
      direction: "in",
      provider_message_id: body.provider_message_id ?? null,
      from_email: fromEmail,
      to_email: toEmail,
      subject: subject,
      body_text: body.body_text ?? ""
    });

    // Store external comment (mirrors incoming email body).
    await supabase.from("ticket_comments").insert({
      organization_id: orgId,
      ticket_id: newTicketId,
      author_id: resolvedRequesterId,
      body: body.body_text ?? "",
      is_internal: false
    });

    await dispatchEventToAutomationAndWebhooks({
      supabaseUrl,
      organizationId: orgId,
      ticketId: newTicketId,
      event_name: "created"
    });

    return jsonResponse({ ok: true, action: "created", ticket_id: newTicketId });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});


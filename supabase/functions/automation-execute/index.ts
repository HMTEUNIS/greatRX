import { serve } from "https://deno.land/std/http/server.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";

type AutomationExecuteRequest = {
  event_name: "created" | "updated" | "solved";
  ticket_id: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type TicketView = {
  id: string;
  organization_id: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  tags: string[] | null;
  requester_id: string | null;
};

function normalizeToArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === "string");
  if (typeof val === "string") return [val];
  return [];
}

function conditionMatches(condition: any, ticket: TicketView): boolean {
  if (!condition || typeof condition !== "object") return false;
  const tags = ticket.tags ?? [];

  // Supported condition types (simple JSON schema).
  const status = condition.status ? normalizeToArray(condition.status) : null;
  if (status && !status.includes(ticket.status)) return false;

  const priority = condition.priority ? normalizeToArray(condition.priority) : null;
  if (priority && !priority.includes(ticket.priority)) return false;

  if (condition.assignee_id) {
    if (typeof condition.assignee_id !== "string") return false;
    if (ticket.assignee_id !== condition.assignee_id) return false;
  }

  const tagsContainsAll = Array.isArray(condition.tags_contains_all) ? condition.tags_contains_all : null;
  if (tagsContainsAll && tagsContainsAll.length > 0) {
    for (const t of tagsContainsAll) {
      if (typeof t !== "string") return false;
      if (!tags.includes(t)) return false;
    }
  }

  const tagsContainsAny = Array.isArray(condition.tags_contains_any) ? condition.tags_contains_any : null;
  if (tagsContainsAny && tagsContainsAny.length > 0) {
    const any = tagsContainsAny.some((t) => typeof t === "string" && tags.includes(t));
    if (!any) return false;
  }

  return true;
}

async function dispatchWebhooksForEvent(supabaseUrl: string, accessTokenSupplied: boolean, organizationId: string, event_name: string, ticket_id: string) {
  // We dispatch by calling the webhook-deliver function directly. The function itself logs deliveries.
  // This keeps the simulator deterministic without requiring DB triggers.
  const supabase = getSupabaseAdminClient();

  const { data: webhooks, error } = await supabase
    .from("webhooks")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .contains("events", [event_name]);

  if (error) throw error;
  const fnUrl = `${supabaseUrl}/functions/v1/webhook-deliver`;

  await Promise.all(
    (webhooks ?? []).map((wh) =>
      fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessTokenSupplied ? {} : {}) },
        body: JSON.stringify({
          webhook_id: wh.id,
          event_name,
          payload: { ticket_id }
        })
      })
    )
  );
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as AutomationExecuteRequest | null;
    if (!body?.ticket_id || !body?.event_name) return jsonResponse({ error: "Missing ticket_id/event_name" }, 400);

    const supabase = getSupabaseAdminClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select("id, organization_id, status, priority, assignee_id, tags, requester_id")
      .eq("id", body.ticket_id)
      .maybeSingle();

    if (ticketErr) throw ticketErr;
    if (!ticket) return jsonResponse({ error: "Ticket not found" }, 404);

    const { data: rules, error: rulesErr } = await supabase
      .from("automation_rules")
      .select("id, name, trigger_event, condition, actions")
      .eq("organization_id", ticket.organization_id)
      .eq("trigger_event", body.event_name)
      .eq("is_active", true);

    if (rulesErr) throw rulesErr;

    const applied: Array<{ rule_id: string; name: string }> = [];

    for (const rule of rules ?? []) {
      const cond = rule.condition;
      if (!conditionMatches(cond, ticket as TicketView)) continue;

      const actions = rule.actions ?? {};
      const nextTicketUpdates: Record<string, unknown> = {};

      // change status
      if (typeof actions.change_status === "string") {
        nextTicketUpdates.status = actions.change_status;
      }

      // assign to
      if (typeof actions.assign_to === "string") {
        // Accept a raw user uuid; UI stores user ids.
        nextTicketUpdates.assignee_id = actions.assign_to;
      }

      // add tag(s)
      if (Array.isArray(actions.add_tags) && actions.add_tags.length > 0) {
        const addTags = actions.add_tags.filter((t: unknown) => typeof t === "string") as string[];
        const merged = Array.from(new Set([...(ticket.tags ?? []), ...addTags]));
        nextTicketUpdates.tags = merged;
      }

      // Apply updates if any.
      const updateKeys = Object.keys(nextTicketUpdates);
      if (updateKeys.length > 0) {
        const beforeStatus = ticket.status;
        const { error: updErr } = await supabase
          .from("tickets")
          .update(nextTicketUpdates)
          .eq("id", ticket.id);

        if (updErr) throw updErr;

        // Refresh ticket view for follow-on actions like email and event dispatch.
        const { data: updatedTicket, error: reloadErr } = await supabase
          .from("tickets")
          .select("id, status, priority, assignee_id, tags, requester_id, organization_id")
          .eq("id", ticket.id)
          .maybeSingle();
        if (reloadErr) throw reloadErr;
        if (updatedTicket) Object.assign(ticket, updatedTicket);

        // Optionally send email (simulator: inserts out direction message into thread)
        if (actions.send_email && typeof actions.send_email === "object") {
          const send = actions.send_email as any;
          if (typeof send.to === "string" && typeof send.subject === "string") {
            const threadKey = `ticket:${ticket.id}`;
            const { data: thread, error: threadErr } = await supabase
              .from("email_threads")
              .select("id")
              .eq("thread_key", threadKey)
              .maybeSingle();
            if (threadErr) throw threadErr;

            let threadId = thread?.id as string | undefined;
            if (!threadId) {
              const { data: createdThread, error: createdErr } = await supabase
                .from("email_threads")
                .insert({ organization_id: ticket.organization_id, ticket_id: ticket.id, thread_key: threadKey })
                .select("id")
                .maybeSingle();
              if (createdErr) throw createdErr;
              threadId = createdThread?.id;
            }

            if (threadId) {
              await supabase.from("email_messages").insert({
                organization_id: ticket.organization_id,
                thread_id: threadId,
                direction: "out",
                from_email: "zengarden@simulator",
                to_email: send.to,
                subject: send.subject,
                body_text: typeof send.body === "string" ? send.body : "",
                provider_message_id: null
              });
            }
          }
        }

        // If the action changed status, we can dispatch webhooks for updated/solved.
        if (actions.change_status && beforeStatus !== actions.change_status) {
          const nextEvent = actions.change_status === "solved" ? "solved" : "updated";
          await dispatchWebhooksForEvent(supabaseUrl, true, ticket.organization_id, nextEvent, ticket.id);
        }
      }

      applied.push({ rule_id: rule.id, name: rule.name });
    }

    return jsonResponse({ ok: true, applied });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});


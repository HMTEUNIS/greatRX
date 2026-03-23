import { getSupabaseServerClient } from "@/lib/supabase/server";

export type TicketEvent = "created" | "updated" | "solved";

const LOG_PREFIX = "[ZenGarden] ticket side-effects";

/**
 * Fire webhook + automation edge functions without failing the HTTP handler.
 * DB writes must succeed even if edge functions are down, misconfigured, or return errors.
 */
export async function dispatchTicketSideEffects(params: {
  organizationId: string;
  ticketId: string;
  event: TicketEvent;
}) {
  await dispatchTicketEnrichment(params);
  await dispatchTicketEventToWebhooks(params);
  await dispatchTicketEventToAutomation(params);
}

async function dispatchTicketEnrichment(params: { organizationId: string; ticketId: string; event: TicketEvent }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn(`${LOG_PREFIX}: missing NEXT_PUBLIC_SUPABASE_URL; skipping ticket enrichment`);
    return;
  }
  // Allow disabling enrichment without code changes.
  if (process.env.NEXT_PUBLIC_ENABLE_TICKET_ENRICHMENT === "false") return;

  const fnUrl = `${supabaseUrl}/functions/v1/ticket-enrich`;
  try {
    const response = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: params.organizationId,
        ticket_id: params.ticketId,
        event_name: params.event
      })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`${LOG_PREFIX}: ticket-enrich HTTP ${response.status}: ${text}`);
    }
  } catch (e) {
    console.error(`${LOG_PREFIX}: ticket-enrich fetch failed`, e);
  }
}

export async function dispatchTicketEventToWebhooks(params: {
  organizationId: string;
  ticketId: string;
  event: TicketEvent;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn(`${LOG_PREFIX}: missing NEXT_PUBLIC_SUPABASE_URL; skipping webhooks`);
    return;
  }

  const supabase = getSupabaseServerClient();
  const { data: webhooks, error } = await supabase
    .from("webhooks")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("active", true)
    .contains("events", [params.event]);
  if (error) {
    console.error(`${LOG_PREFIX}: webhook list query failed`, error);
    return;
  }

  const fnUrl = `${supabaseUrl}/functions/v1/webhook-deliver`;

  await Promise.all(
    (webhooks ?? []).map(async (wh) => {
      try {
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            webhook_id: wh.id,
            event_name: params.event,
            payload: { ticket_id: params.ticketId }
          })
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`${LOG_PREFIX}: webhook-deliver HTTP ${res.status} for webhook ${wh.id}: ${text}`);
        }
      } catch (e) {
        console.error(`${LOG_PREFIX}: webhook-deliver fetch failed for webhook ${wh.id}`, e);
      }
    })
  );
}

export async function dispatchTicketEventToAutomation(params: { ticketId: string; event: TicketEvent }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn(`${LOG_PREFIX}: missing NEXT_PUBLIC_SUPABASE_URL; skipping automation`);
    return;
  }

  const fnUrl = `${supabaseUrl}/functions/v1/automation-execute`;
  try {
    const response = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: params.ticketId, event_name: params.event })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`${LOG_PREFIX}: automation-execute HTTP ${response.status}: ${text}`);
    }
  } catch (e) {
    console.error(`${LOG_PREFIX}: automation-execute fetch failed`, e);
  }
}


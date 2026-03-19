import { getSupabaseServerClient } from "@/lib/supabase/server";

export type TicketEvent = "created" | "updated" | "solved";

export async function dispatchTicketEventToWebhooks(params: {
  organizationId: string;
  ticketId: string;
  event: TicketEvent;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");

  const supabase = getSupabaseServerClient();
  const { data: webhooks, error } = await supabase
    .from("webhooks")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("active", true)
    .contains("events", [params.event]);
  if (error) throw error;

  const fnUrl = `${supabaseUrl}/functions/v1/webhook-deliver`;

  await Promise.all(
    (webhooks ?? []).map((wh) =>
      fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_id: wh.id,
          event_name: params.event,
          payload: { ticket_id: params.ticketId }
        })
      })
    )
  );
}

export async function dispatchTicketEventToAutomation(params: { ticketId: string; event: TicketEvent }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");

  const fnUrl = `${supabaseUrl}/functions/v1/automation-execute`;
  const response = await fetch(fnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_id: params.ticketId, event_name: params.event })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Automation dispatch failed: HTTP ${response.status} ${text}`);
  }
}


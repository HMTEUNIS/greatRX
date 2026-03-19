import { serve } from "https://deno.land/std/http/server.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { hmacSha256Hex } from "../_shared/crypto.ts";

type WebhookDeliverRequest = {
  webhook_id: string;
  event_name: string;
  payload: unknown;
  max_attempts?: number;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const reqJson = (await req.json().catch(() => null)) as WebhookDeliverRequest | null;
    if (!reqJson?.webhook_id || !reqJson?.event_name) return jsonResponse({ error: "Missing webhook_id/event_name" }, 400);

    const maxAttempts = Math.max(1, Math.min(5, reqJson.max_attempts ?? 3));
    const supabase = getSupabaseAdminClient();

    const { data: webhook, error: webhookErr } = await supabase
      .from("webhooks")
      .select("id, organization_id, target_url, secret, active")
      .eq("id", reqJson.webhook_id)
      .maybeSingle();

    if (webhookErr) throw webhookErr;
    if (!webhook || !webhook.active) return jsonResponse({ error: "Webhook not found or inactive" }, 404);

    const requestPayload = {
      event_name: reqJson.event_name,
      payload: reqJson.payload ?? null
    };

    const requestBody = JSON.stringify(requestPayload);

    let lastError: string | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timestamp = new Date().toISOString();
      const signedMessage = `${timestamp}.${reqJson.event_name}.${requestBody}`;
      const signature = await hmacSha256Hex(webhook.secret, signedMessage);

      let responseStatus: number | null = null;
      let responseBody: string | null = null;
      let success = false;

      try {
        const response = await fetch(webhook.target_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ZenGarden-Event": reqJson.event_name,
            "X-ZenGarden-Timestamp": timestamp,
            "X-ZenGarden-Signature": signature
          },
          body: requestBody
        });

        responseStatus = response.status;
        // Keep logs bounded.
        responseBody = await response.text();
        if (responseBody && responseBody.length > 64_000) responseBody = responseBody.slice(0, 64_000);

        success = response.ok;
        if (!success) lastError = `HTTP ${response.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Delivery failed";
      }

      const { error: logErr } = await supabase.from("webhook_deliveries").insert({
        organization_id: webhook.organization_id,
        webhook_id: webhook.id,
        event_name: reqJson.event_name,
        attempt,
        request_payload: requestPayload,
        response_status: responseStatus,
        response_body: responseBody,
        success
      });

      if (logErr) {
        // Logging should not hide delivery outcome; just capture it.
        lastError = `Delivery OK but log insert failed: ${logErr.message ?? String(logErr)}`;
      }

      if (success) return jsonResponse({ ok: true, attempt, lastError: null });
      // Exponential backoff (e.g. 250ms, 500ms, 1s)
      await sleep(250 * Math.pow(2, attempt - 1));
    }

    return jsonResponse(
      { ok: false, error: lastError ?? "Delivery failed", webhook_id: reqJson.webhook_id, event_name: reqJson.event_name },
      502
    );
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});


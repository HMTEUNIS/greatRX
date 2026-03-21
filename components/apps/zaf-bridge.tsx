"use client";

import * as React from "react";

type ZafResponse = {
  type: "ZAF_RESPONSE";
  requestId: string | number | null;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type ZafBridgeProps = {
  iframeOrigin: string | null;
  context: {
    ticketId?: string | null;
    userId?: string | null;
    organizationId?: string | null;
    pharmacyId?: string | null;
    medicationId?: string | null;
  };
  /** When set, only handle messages from this iframe (avoids duplicate parent listeners). */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
};

function safeJson(v: unknown) {
  if (v === undefined) return null;
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return v;
  }
}

export function ZafBridge({ iframeOrigin, context, iframeRef }: ZafBridgeProps) {
  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (iframeOrigin && event.origin !== iframeOrigin) return;
      if (iframeRef) {
        const win = iframeRef.current?.contentWindow;
        if (!win || event.source !== win) return;
      }

      const data = event.data as any;
      if (!data || typeof data !== "object") return;

      // Minimal compatibility layer. We accept a "ZAF_REQUEST" envelope and respond with "ZAF_RESPONSE".
      // Apps can implement a subset of Zendesk-like requests for this simulator.
      const type = data.type ?? data.kind;
      const isRequest = type === "ZAF_REQUEST" || type === "zendeskAppRequest";
      if (!isRequest) return;

      const requestId = data.requestId ?? data.id ?? null;
      const method = data.method ?? data.action ?? data.operation;
      const args = data.payload ?? data.args ?? data.parameters ?? {};

      const response: ZafResponse = { type: "ZAF_RESPONSE", requestId, ok: true, result: null };
      try {
        switch (method) {
          case "get":
          case "read": {
            const key = typeof args?.key === "string" ? args.key : typeof args === "string" ? args : null;
            if (!key) throw new Error("Missing key");
            if (key === "ticketId") response.result = { value: context.ticketId ?? null };
            else if (key === "userId") response.result = { value: context.userId ?? null };
            else if (key === "organizationId") response.result = { value: context.organizationId ?? null };
            else if (key === "pharmacyId" || key === "pharmacy_id")
              response.result = { value: context.pharmacyId ?? null };
            else if (key === "medicationId" || key === "medication_id")
              response.result = { value: context.medicationId ?? null };
            else response.result = { value: null };
            break;
          }
          case "ping": {
            response.result = { pong: true };
            break;
          }
          default: {
            // Echo unknown method to keep the integration testable.
            response.ok = true;
            response.result = { echoed: { method, args: safeJson(args) } };
          }
        }
      } catch (err) {
        response.ok = false;
        response.error = err instanceof Error ? err.message : "Request failed";
      }

      (event.source as WindowProxy | null)?.postMessage(response, event.origin);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    context.medicationId,
    context.organizationId,
    context.pharmacyId,
    context.ticketId,
    context.userId,
    iframeOrigin,
    iframeRef
  ]);

  return null;
}


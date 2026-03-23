"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Matches ZenGarden ticket IDs from `0001_init.sql` (uuid). */
const TICKET_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTicketIdFromMessageData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const action = (data as { action?: unknown }).action;
  if (typeof action !== "string") return null;
  const m = action.match(/^ticket:\s*(.+)$/i);
  const raw = m?.[1]?.trim();
  if (!raw || !TICKET_ID_RE.test(raw)) return null;
  return raw;
}

/**
 * Retool (and some sandboxed embeds) may report `origin === "null"`.
 * Also allow `*.retool.com` and optional `NEXT_PUBLIC_EMBED_POSTMESSAGE_ORIGINS` (comma-separated).
 */
function isAllowedMessageOrigin(origin: string): boolean {
  if (origin === "null") return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "retool.com" || host.endsWith(".retool.com")) return true;
  } catch {
    return false;
  }
  const extra = process.env.NEXT_PUBLIC_EMBED_POSTMESSAGE_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return extra.includes(origin);
}

/**
 * Listens for `postMessage` from embedded apps (e.g. Retool) with
 * `{ action: "ticket: <uuid>" }` and navigates the host app to that ticket.
 */
export function EmbedTicketNavigationListener() {
  const router = useRouter();

  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isAllowedMessageOrigin(event.origin)) return;
      const ticketId = parseTicketIdFromMessageData(event.data);
      if (!ticketId) return;
      router.push(`/tickets/${ticketId}`);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}

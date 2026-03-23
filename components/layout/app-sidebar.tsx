"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseRxIdsFromTags } from "@/lib/zaf/ticket-context";
import { ZafBridge } from "@/components/apps/zaf-bridge";

const ISSUE_TRACKER_URL = "https://hollyteunis.retool.com/embedded/public/05c972f2-645d-4465-8256-67be3acdc3ba";

const TICKET_PATH = /^\/tickets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function AppSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const iframeOrigin = React.useMemo(() => {
    try {
      return new URL(ISSUE_TRACKER_URL).origin;
    } catch {
      return null;
    }
  }, []);

  const ticketId = React.useMemo(() => {
    const m = pathname.match(TICKET_PATH);
    return m?.[1] ?? null;
  }, [pathname]);

  const [pharmacyId, setPharmacyId] = React.useState<string | null>(null);
  const [medicationId, setMedicationId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!ticketId) {
      setPharmacyId(null);
      setMedicationId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v2/tickets/${ticketId}`);
        const data = (await res.json()) as { ticket?: { tags?: string[] | null } };
        if (!res.ok || cancelled) return;
        const { pharmacyId: p, medicationId: m } = parseRxIdsFromTags(data.ticket?.tags ?? null);
        if (!cancelled) {
          setPharmacyId(p);
          setMedicationId(m);
        }
      } catch {
        if (!cancelled) {
          setPharmacyId(null);
          setMedicationId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const [userId, setUserId] = React.useState<string | null>(null);
  const [organizationId, setOrganizationId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data: row } = await supabase.from("users").select("organization_id").eq("id", u.user.id).maybeSingle();
        if (!cancelled) {
          setUserId(u.user.id);
          setOrganizationId(row?.organization_id ?? null);
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPublicAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  if (isPublicAuthPage) return null;

  return (
    <>
      <ZafBridge
        iframeOrigin={iframeOrigin}
        iframeRef={iframeRef}
        context={{ ticketId, userId, organizationId, pharmacyId, medicationId }}
      />

      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="fixed right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-md bg-primary px-2 py-3 text-primary-foreground shadow-md transition-all duration-200 hover:bg-primary/90"
        title={isCollapsed ? "Open known issue tracking" : "Close known issue tracking"}
      >
        {isCollapsed ? "◀ Known issue tracking" : "Known issue tracking ▶"}
      </button>

      <div
        className={`fixed right-0 top-1/2 z-40 h-[52vh] min-w-[50vw] w-[70vw] max-w-[75vw] -translate-y-1/2 border-l bg-background shadow-xl transition-transform duration-200 ${
          isCollapsed ? "translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b px-4 py-3 text-sm font-medium">
            Known issue tracking
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <iframe
              ref={iframeRef}
              src={ISSUE_TRACKER_URL}
              className="h-full min-h-[420px] w-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              title="Known issue tracking"
            />
          </div>
        </div>
      </div>
    </>
  );
}

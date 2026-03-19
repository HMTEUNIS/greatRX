"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/auth/roles";

export function SessionBadge() {
  const [email, setEmail] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<UserRole | null>(null);
  const [organizationId, setOrganizationId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const supabaseHost = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const supabase = getSupabaseBrowserClient();

    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) {
          if (!cancelled) {
            setEmail(null);
            setRole(null);
            setOrganizationId(null);
            setRowError(null);
          }
          return;
        }

        const { data: row, error: rowErr } = await supabase
          .from("users")
          .select("role,organization_id")
          .eq("id", user.id)
          .single();
        if (!cancelled) {
          setEmail(user.email ?? null);
          setRole((row?.role as UserRole | null) ?? null);
          setOrganizationId((row?.organization_id as string | null) ?? null);
          setRowError(rowErr ? rowErr.message : null);
        }
      } catch {
        // If role lookup fails (e.g. user mapping not created), show email only.
        if (!cancelled) {
          setEmail((prev) => prev ?? null);
          setRole((prev) => prev);
          setOrganizationId((prev) => prev);
          setRowError(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    // Keep the badge in sync after login/logout without requiring a full reload.
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) return null;
  if (!email) return <div className="text-xs text-muted-foreground">Signed in: (guest)</div>;

  return (
    <div className="text-xs text-muted-foreground">
      Signed in as{" "}
      <span className="font-medium text-foreground">
        {email}
        {role ? ` (${role})` : ""}
      </span>
      <div className="text-[11px] text-muted-foreground/90">
        Org: {organizationId ? organizationId.slice(0, 8) + "…" : "(missing)"}
      </div>
      {rowError ? <div className="text-[11px] text-red-600/80">users row error: {rowError}</div> : null}
      {supabaseHost ? (
        <div className="text-[11px] text-muted-foreground/70">
          Supabase: {supabaseHost}
        </div>
      ) : null}
    </div>
  );
}


"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onLogout() {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Even if signOut fails, we still clear local navigation.
    } finally {
      setBusy(false);
      router.push("/login");
    }
  }

  return (
    <Button onClick={() => void onLogout()} disabled={busy} variant="secondary" className={className}>
      {busy ? "Logging out..." : "Log out"}
    </Button>
  );
}


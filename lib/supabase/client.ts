"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveDemoModeClient } from "@/lib/runtime/live-demo";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");

  client = createBrowserClient(url, anonKey);

  // In live demo mode, prevent direct client-side DB writes via Supabase SDK.
  // All mutations should go through server/Edge endpoints (which are also blocked here).
  if (isLiveDemoModeClient()) {
    const liveError = new Error("Live demo mode enabled: client-side DB writes are disabled.");
    const originalFrom = (client as any).from?.bind(client);
    if (typeof originalFrom === "function") {
      (client as any).from = (table: string) => {
        const qb = originalFrom(table);
        return new Proxy(qb, {
          get(target, prop, receiver) {
            if (typeof prop === "string") {
              if (prop === "insert" || prop === "update" || prop === "delete" || prop === "upsert") {
                return () => {
                  throw liveError;
                };
              }
            }
            return Reflect.get(target, prop, receiver);
          }
        });
      };
    }

    const originalRpc = (client as any).rpc?.bind(client);
    if (typeof originalRpc === "function") {
      (client as any).rpc = (...args: any[]) => {
        throw liveError;
      };
    }
  }
  return client;
}


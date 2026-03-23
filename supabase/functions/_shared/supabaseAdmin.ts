import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function getSupabaseAdminClient() {
  // Prefer project-defined secrets (non-reserved names), then fall back.
  const supabaseUrl = Deno.env.get("ZENGARDEN_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("ZENGARDEN_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL env var");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ZenGarden-edge" } }
  });
}


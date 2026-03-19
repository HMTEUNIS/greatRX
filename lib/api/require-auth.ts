import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAuth() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { ok: false as const, status: 401, error: error?.message ?? "Unauthorized" };
  }
  return { ok: true as const, status: 200, user: data.user };
}


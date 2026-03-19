import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const supabase = getSupabaseServerClient();
  const { data: authUser, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authUser?.user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.user.id)
    .single();
  if (error) return null;
  return (data?.role as UserRole) ?? null;
}


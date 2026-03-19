import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/require-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth/user";

export async function requireAdminOrResponse() {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };

  const role = await getCurrentUserRole();
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const supabase = getSupabaseServerClient();
  const { data: me, error: meErr } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (meErr || !me?.organization_id) {
    return { ok: false as const, response: NextResponse.json({ error: meErr?.message ?? "No organization" }, { status: 400 }) };
  }

  return { ok: true as const, auth, role, organizationId: me.organization_id as string };
}


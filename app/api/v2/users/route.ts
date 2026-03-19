import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api/require-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabaseServerClient();
  const userId = auth.user.id;
  const { data: me, error: meErr } = await supabase.from("users").select("organization_id, role").eq("id", userId).single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { data, error } = await supabase
    .from("users")
    .select("id, role")
    .eq("organization_id", me.organization_id)
    .order("role", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] }, { status: 200 });
}


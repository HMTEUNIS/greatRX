import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api/require-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const SaveSettingsSchema = z.object({
  settings: z.record(z.unknown())
});

export async function GET(_: Request, { params }: { params: { appId: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabaseServerClient();
  const { data: me, error: meErr } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { data: app, error: appErr } = await supabase
    .from("apps")
    .select("id,name,version,location,iframe_url,manifest_json")
    .eq("id", params.appId)
    .eq("organization_id", me.organization_id)
    .maybeSingle();
  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: row, error: sErr } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", me.organization_id)
    .eq("app_id", params.appId)
    .maybeSingle();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json(
    {
      app,
      settings: (row?.settings ?? {}) as Record<string, unknown>
    },
    { status: 200 }
  );
}

export async function PUT(req: Request, { params }: { params: { appId: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = SaveSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { data: me, error: meErr } = await supabase.from("users").select("organization_id").eq("id", auth.user.id).single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

  // Ensure app exists in org before allowing upsert.
  const { data: app, error: appErr } = await supabase
    .from("apps")
    .select("id")
    .eq("id", params.appId)
    .eq("organization_id", me.organization_id)
    .maybeSingle();
  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: upsertErr } = await supabase.from("app_settings").upsert(
    {
      organization_id: me.organization_id,
      app_id: params.appId,
      settings: parsed.data.settings
    },
    { onConflict: "organization_id,app_id" }
  );
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}


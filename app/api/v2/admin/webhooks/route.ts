import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminOrResponse } from "@/lib/api/require-admin";

const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  events: z.array(z.enum(["created", "updated", "solved"])).min(1).max(3),
  target_url: z.string().url().max(2000),
  secret: z.string().min(1).max(500),
  active: z.boolean().optional().default(true)
});

export async function POST(req: Request) {
  const admin = await requireAdminOrResponse();
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error: insertErr } = await supabase.from("webhooks").insert({
    organization_id: admin.organizationId,
    name: parsed.data.name,
    events: parsed.data.events,
    target_url: parsed.data.target_url,
    secret: parsed.data.secret,
    active: parsed.data.active
  });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}


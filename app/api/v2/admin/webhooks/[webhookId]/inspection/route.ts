import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminOrResponse } from "@/lib/api/require-admin";

const PatchInspectionSchema = z.object({
  event_name: z.enum(["created", "updated", "solved"]),
  language: z.string().max(50).optional().default("json"),
  code: z.string().min(1).max(200_000)
});

export async function PATCH(req: Request, { params }: { params: { webhookId: string } }) {
  const admin = await requireAdminOrResponse();
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => null);
  const parsed = PatchInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { error: upsertErr } = await supabase.from("webhook_inspections").upsert(
    {
      organization_id: admin.organizationId,
      webhook_id: params.webhookId,
      event_name: parsed.data.event_name,
      language: parsed.data.language,
      code: parsed.data.code
    },
    { onConflict: "organization_id,webhook_id,event_name" }
  );

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 200 });
}


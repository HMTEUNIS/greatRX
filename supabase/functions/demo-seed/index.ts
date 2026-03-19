import { serve } from "https://deno.land/std/http/server.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const liveDemo = Deno.env.get("LIVE_DEMO_MODE") === "true";
    if (liveDemo) return jsonResponse({ error: "Live demo mode enabled: demo seeding disabled." }, 403);

    const tokenHeader = req.headers.get("x-zengarden-seed-token") ?? "";
    const expected = Deno.env.get("ZENGARDEN_DEMO_SEED_TOKEN");
    if (expected && tokenHeader !== expected) return jsonResponse({ error: "Unauthorized" }, 401);

    const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
    const supabase = getSupabaseAdminClient();

    // Ensure Default org exists.
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("name", "Default")
      .maybeSingle();
    if (orgErr) throw orgErr;
    const orgId = (org?.id as string | undefined) ?? null;

    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      const { data: createdOrg, error: createdOrgErr } = await supabase
        .from("organizations")
        .insert({ name: "Default" })
        .select("id")
        .maybeSingle();
      if (createdOrgErr) throw createdOrgErr;
      resolvedOrgId = createdOrg?.id as string | undefined;
    }
    if (!resolvedOrgId) throw new Error("Failed to resolve organization id");

    const demoUsers = [
      { email: "admin@zengarden.dev", password: "Admin1234!", role: "admin" as const },
      { email: "agent@zengarden.dev", password: "Agent1234!", role: "agent" as const }
    ];

    for (const u of demoUsers) {
      // Create auth user if missing
      const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
      const hit = (authUsers ?? []).find((x: any) => x.email?.toLowerCase() === u.email.toLowerCase());
      let authId = hit?.id as string | undefined;

      if (!authId) {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true
        });
        if (createErr) throw createErr;
        authId = created?.user?.id as string | undefined;
      }

      if (!authId) throw new Error(`Failed to resolve auth user for ${u.email}`);

      // Ensure public.users row exists and set role/org.
      const { error: upErr } = await supabase.from("users").upsert(
        { id: authId, organization_id: resolvedOrgId, role: u.role },
        { onConflict: "id" }
      );
      if (upErr) throw upErr;
    }

    if (!force) {
      const { count, error } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", resolvedOrgId);
      if (error) throw error;
      if ((count ?? 0) > 0) return jsonResponse({ ok: true, seeded: false, reason: "Tickets already exist. Use force=true to reseed." });
    }

    // Clear existing demo data in current org (for reseed).
    if (force) {
      await supabase.from("webhook_deliveries").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("webhooks").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("automation_rules").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("ticket_comments").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("ticket_status_history").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("tickets").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("email_messages").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("email_threads").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("apps").delete().eq("organization_id", resolvedOrgId);
      await supabase.from("app_settings").delete().eq("organization_id", resolvedOrgId);
    }

    const { data: requesterUsers } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", resolvedOrgId)
      .limit(2);

    const requesterId = (requesterUsers?.[0]?.id as string) ?? null;
    const agentId = (requesterUsers?.[1]?.id as string) ?? null;
    if (!requesterId || !agentId) throw new Error("Failed to resolve demo user ids");

    // Seed tickets
    const { data: t1 } = await supabase.from("tickets").insert({
      organization_id: resolvedOrgId,
      subject: "Webhook delivery test: ticket created",
      description: "Hello ZenGarden, please validate webhook signatures and retries.",
      type: "question",
      status: "open",
      priority: "high",
      tags: ["webhook", "created"],
      requester_id: requesterId,
      assignee_id: agentId
    }).select("id").maybeSingle();

    const { data: t2 } = await supabase.from("tickets").insert({
      organization_id: resolvedOrgId,
      subject: "Automation SLA simulation: status pending",
      description: "Move this ticket to pending, then solved.",
      type: "incident",
      status: "pending",
      priority: "normal",
      tags: ["automation", "sla"],
      requester_id: requesterId,
      assignee_id: agentId
    }).select("id").maybeSingle();

    if (!t1?.id || !t2?.id) throw new Error("Failed to seed tickets");

    await supabase.from("ticket_comments").insert([
      {
        organization_id: resolvedOrgId,
        ticket_id: t1.id,
        author_id: requesterId,
        body: "Initial customer message.",
        is_internal: false
      },
      {
        organization_id: resolvedOrgId,
        ticket_id: t1.id,
        author_id: agentId,
        body: "Internal note: expect webhook delivery logs in the inspector.",
        is_internal: true
      }
    ]);

    // Seed a sample automation rule (agents can tweak later)
    await supabase.from("automation_rules").insert({
      organization_id: resolvedOrgId,
      name: "If priority urgent, set to pending and add tag",
      trigger_event: "created",
      is_active: true,
      condition: { priority: "urgent" },
      actions: { change_status: "pending", add_tags: ["urgent-pending"] }
    });

    return jsonResponse({ ok: true, seeded: true, organization_id: resolvedOrgId });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});


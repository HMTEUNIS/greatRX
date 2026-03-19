"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/auth/roles";
import { isLiveDemoModeClient } from "@/lib/runtime/live-demo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserRow = { id: string; role: UserRole };
type AppRow = { id: string; name: string; version: string; location: string; iframe_url: string };
type WebhookRow = { id: string; name: string; events: string[]; target_url: string; active: boolean; secret: string };
type AutomationRuleRow = { id: string; name: string; trigger_event: string; is_active: boolean; condition: any; actions: any };
type EmailConfigRow = {
  support_email: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string | null;
  password_secret: string | null;
};

function parseEventsCsv(csv: string) {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AdminClient() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [organizationId, setOrganizationId] = React.useState<string | null>(null);
  const liveDemoMode = isLiveDemoModeClient();

  if (liveDemoMode) {
    // eslint-disable-next-line no-console
    console.info("Live demo mode enabled: admin write actions disabled.");
  }

  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [apps, setApps] = React.useState<AppRow[]>([]);
  const [webhooks, setWebhooks] = React.useState<WebhookRow[]>([]);
  const [deliveries, setDeliveries] = React.useState<any[]>([]);
  const [rules, setRules] = React.useState<AutomationRuleRow[]>([]);
  const [emailConfig, setEmailConfig] = React.useState<EmailConfigRow | null>(null);

  // Webhook form
  const [whName, setWhName] = React.useState("Ticket webhook");
  const [whEvents, setWhEvents] = React.useState("created,updated,solved");
  const [whTargetUrl, setWhTargetUrl] = React.useState("https://example.com/webhook");
  const [whSecret, setWhSecret] = React.useState("whsec_demo_secret");

  // Automation form
  const [ruleName, setRuleName] = React.useState("Urgent -> pending");
  const [ruleTrigger, setRuleTrigger] = React.useState("created");
  const [condStatus, setCondStatus] = React.useState("urgent");
  const [condPriority, setCondPriority] = React.useState("urgent");
  const [condAssigneeId, setCondAssigneeId] = React.useState("");
  const [condTagsAll, setCondTagsAll] = React.useState("automation");
  const [actChangeStatus, setActChangeStatus] = React.useState("pending");
  const [actAddTags, setActAddTags] = React.useState("urgent-pending");
  const [actAssignTo, setActAssignTo] = React.useState("");
  const [actSendEmailTo, setActSendEmailTo] = React.useState("");
  const [actSendEmailSubject, setActSendEmailSubject] = React.useState("Automation email from ZenGarden");

  // App install form
  const [appName, setAppName] = React.useState("Demo App");
  const [appVersion, setAppVersion] = React.useState("1.0.0");
  const [appLocation, setAppLocation] = React.useState("sidebar");
  const [appIframeUrl, setAppIframeUrl] = React.useState("https://example.com/app-iframe");

  const [appSettingsJson, setAppSettingsJson] = React.useState("{\n  \"example\": true\n}");

  // Email config form
  const [emailSupportEmail, setEmailSupportEmail] = React.useState("support@zengarden.dev");
  const [imapHost, setImapHost] = React.useState("imap.gmail.com");
  const [imapPort, setImapPort] = React.useState(993);
  const [smtpHost, setSmtpHost] = React.useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = React.useState(587);
  const [smtpUsername, setSmtpUsername] = React.useState("");
  const [smtpPasswordSecret, setSmtpPasswordSecret] = React.useState("");

  async function refresh() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    setBusy(true);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      const userId = authUser.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { data: myRow, error: myErr } = await supabase.from("users").select("organization_id").eq("id", userId).maybeSingle();
      if (myErr) throw myErr;
      const orgId = myRow?.organization_id as string | null;
      setOrganizationId(orgId);
      if (!orgId) throw new Error("User has no organization_id assigned");

      const { data: u, error: uErr } = await supabase.from("users").select("id, role").order("role", { ascending: false });
      if (uErr) throw uErr;
      setUsers((u ?? []) as UserRow[]);

      const { data: a, error: aErr } = await supabase.from("apps").select("*").order("created_at", { ascending: false });
      if (aErr) throw aErr;
      setApps((a ?? []) as AppRow[]);

      const { data: w, error: wErr } = await supabase.from("webhooks").select("*").order("created_at", { ascending: false });
      if (wErr) throw wErr;
      setWebhooks((w ?? []) as WebhookRow[]);

      const { data: d, error: dErr } = await supabase.from("webhook_deliveries").select("*").order("created_at", { ascending: false }).limit(50);
      if (dErr) throw dErr;
      setDeliveries(d ?? []);

      const { data: r, error: rErr } = await supabase.from("automation_rules").select("*").order("created_at", { ascending: false });
      if (rErr) throw rErr;
      setRules((r ?? []) as AutomationRuleRow[]);

      const { data: ec, error: ecErr } = await supabase.from("email_config").select("*").limit(1).maybeSingle();
      if (ecErr) throw ecErr;
      setEmailConfig((ec ?? null) as EmailConfigRow | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createWebhook() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    setBusy(true);
    try {
      if (liveDemoMode) throw new Error("Live demo mode enabled: webhook writes disabled.");
      if (!organizationId) throw new Error("Missing organization id");
      const events = parseEventsCsv(whEvents);
      const { error: wErr } = await supabase.from("webhooks").insert({
        organization_id: organizationId,
        name: whName,
        events,
        target_url: whTargetUrl,
        secret: whSecret,
        active: true
      });
      if (wErr) throw wErr;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setBusy(false);
    }
  }

  async function createAutomation() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    setBusy(true);
    try {
      if (liveDemoMode) throw new Error("Live demo mode enabled: automation writes disabled.");
      if (!organizationId) throw new Error("Missing organization id");
      const cond: any = {};
      if (condStatus.trim()) cond.status = condStatus.trim();
      if (condPriority.trim()) cond.priority = condPriority.trim();
      if (condAssigneeId.trim()) cond.assignee_id = condAssigneeId.trim();
      if (condTagsAll.trim()) cond.tags_contains_all = condTagsAll.split(",").map((s) => s.trim()).filter(Boolean);

      const actions: any = {
        ...(actChangeStatus ? { change_status: actChangeStatus } : {}),
        ...(actAddTags.trim() ? { add_tags: actAddTags.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
        ...(actAssignTo.trim() ? { assign_to: actAssignTo.trim() } : {})
      };
      if (actSendEmailTo.trim()) {
        actions.send_email = { to: actSendEmailTo.trim(), subject: actSendEmailSubject, body: "Sent by ZenGarden automation." };
      }

      const { error: rErr } = await supabase.from("automation_rules").insert({
        organization_id: organizationId,
        name: ruleName,
        trigger_event: ruleTrigger,
        is_active: true,
        condition: cond,
        actions
      });
      if (rErr) throw rErr;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create automation rule");
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    setBusy(true);
    try {
      if (liveDemoMode) throw new Error("Live demo mode enabled: app install writes disabled.");
      if (!organizationId) throw new Error("Missing organization id");
      const manifestJson = appSettingsJson.trim() ? JSON.parse(appSettingsJson) : {};
      const { error: iErr } = await supabase.from("apps").insert({
        organization_id: organizationId,
        name: appName,
        version: appVersion,
        location: appLocation,
        iframe_url: appIframeUrl,
        manifest_json: manifestJson
      });
      if (iErr) throw iErr;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install app");
    } finally {
      setBusy(false);
    }
  }

  async function upsertEmailConfig() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    setBusy(true);
    try {
      if (liveDemoMode) throw new Error("Live demo mode enabled: email config writes disabled.");
      if (!organizationId) throw new Error("Missing organization id");
      const { error: eErr } = await supabase.from("email_config").upsert(
        {
          organization_id: organizationId,
          name: "gmail",
          support_email: emailSupportEmail,
          imap_host: imapHost,
          imap_port: imapPort,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          username: smtpUsername || null,
          password_secret: smtpPasswordSecret || null
        } as any,
        { onConflict: "organization_id,support_email" }
      );
      if (eErr) throw eErr;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save email config");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">Manage users, apps, webhooks, automations, and email settings.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void refresh()} disabled={busy}>
            Refresh
          </Button>
        </div>
      </div>

      {liveDemoMode ? (
        <div className="mb-4 rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-900">
          Live demo mode is ON. Admin write actions are disabled.
        </div>
      ) : null}

      {error ? <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Users</div>
            <div className="mt-2 space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span className="truncate">{u.id}</span>
                  <span className="text-muted-foreground">{u.role}</span>
                </div>
              ))}
              {!users.length ? <div className="text-sm text-muted-foreground">No users loaded.</div> : null}
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Webhook deliveries (latest)</div>
            <div className="mt-2 space-y-2">
              {deliveries.slice(0, 10).map((d) => (
                <div key={d.id} className="rounded border p-2 text-xs">
                  <div className="font-medium">
                    {d.event_name} · attempt {d.attempt} · {d.success ? "OK" : "FAIL"}
                  </div>
                  <div className="text-muted-foreground">Status: {d.response_status ?? "-"}</div>
                </div>
              ))}
              {!deliveries.length ? <div className="text-sm text-muted-foreground">No deliveries yet.</div> : null}
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Create webhook</div>
            <div className="mt-2 space-y-2">
              <Label>Name</Label>
              <Input value={whName} onChange={(e) => setWhName(e.target.value)} />
              <Label>Events (comma separated: created,updated,solved)</Label>
              <Input value={whEvents} onChange={(e) => setWhEvents(e.target.value)} />
              <Label>Target URL</Label>
              <Input value={whTargetUrl} onChange={(e) => setWhTargetUrl(e.target.value)} />
              <Label>Secret</Label>
              <Input value={whSecret} onChange={(e) => setWhSecret(e.target.value)} />
              <Button onClick={() => void createWebhook()} disabled={busy} className="w-full">
                Create webhook
              </Button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Active webhooks</div>
            <div className="mt-2 space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="rounded border p-2 text-sm">
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground">{w.target_url}</div>
                  <div className="text-xs text-muted-foreground">Events: {w.events.join(", ")}</div>
                </div>
              ))}
              {!webhooks.length ? <div className="text-sm text-muted-foreground">No webhooks yet.</div> : null}
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Automation rules</div>
            <div className="mt-2 space-y-2">
              <Label>Name</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
              <Label>Trigger event</Label>
              <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={ruleTrigger} onChange={(e) => setRuleTrigger(e.target.value)}>
                <option value="created">created</option>
                <option value="updated">updated</option>
                <option value="solved">solved</option>
              </select>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>Status (condition.status)</Label>
                  <Input value={condStatus} onChange={(e) => setCondStatus(e.target.value)} />
                </div>
                <div>
                  <Label>Priority (condition.priority)</Label>
                  <Input value={condPriority} onChange={(e) => setCondPriority(e.target.value)} />
                </div>
              </div>
              <Label>Assignee user_id (optional)</Label>
              <Input value={condAssigneeId} onChange={(e) => setCondAssigneeId(e.target.value)} placeholder="uuid" />
              <Label>Tags contains all (comma separated)</Label>
              <Input value={condTagsAll} onChange={(e) => setCondTagsAll(e.target.value)} />

              <hr />

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>Action change status</Label>
                  <Input value={actChangeStatus} onChange={(e) => setActChangeStatus(e.target.value)} />
                </div>
                <div>
                  <Label>Action add tags</Label>
                  <Input value={actAddTags} onChange={(e) => setActAddTags(e.target.value)} />
                </div>
              </div>
              <Label>Action assign_to user_id (optional)</Label>
              <Input value={actAssignTo} onChange={(e) => setActAssignTo(e.target.value)} placeholder="uuid" />

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>Send email to (optional)</Label>
                  <Input value={actSendEmailTo} onChange={(e) => setActSendEmailTo(e.target.value)} placeholder="agent@example.com" />
                </div>
                <div>
                  <Label>Email subject</Label>
                  <Input value={actSendEmailSubject} onChange={(e) => setActSendEmailSubject(e.target.value)} />
                </div>
              </div>

              <Button onClick={() => void createAutomation()} disabled={busy} className="w-full">
                Create automation
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {rules.slice(0, 5).map((r) => (
              <div key={r.id} className="rounded border p-2 text-sm">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">Trigger: {r.trigger_event}</div>
              </div>
            ))}
            {!rules.length ? <div className="text-sm text-muted-foreground">No rules yet.</div> : null}
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Apps</div>
            <div className="mt-2 space-y-2">
              <Label>Name</Label>
              <Input value={appName} onChange={(e) => setAppName(e.target.value)} />
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>Version</Label>
                  <Input value={appVersion} onChange={(e) => setAppVersion(e.target.value)} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={appLocation} onChange={(e) => setAppLocation(e.target.value)} />
                </div>
              </div>
              <Label>Iframe URL</Label>
              <Input value={appIframeUrl} onChange={(e) => setAppIframeUrl(e.target.value)} />
              <Label>manifest.json (JSON)</Label>
              <textarea className="min-h-[120px] w-full rounded-md border border-border bg-background p-2 text-sm" value={appSettingsJson} onChange={(e) => setAppSettingsJson(e.target.value)} />
              <Button onClick={() => void installApp()} disabled={busy} className="w-full">
                Install app
              </Button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Installed apps</div>
            <div className="mt-2 space-y-2">
              {apps.map((a) => (
                <div key={a.id} className="rounded border p-2 text-sm">
                  <div className="font-medium">{a.name} v{a.version}</div>
                  <div className="text-xs text-muted-foreground">{a.location}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.iframe_url}</div>
                </div>
              ))}
              {!apps.length ? <div className="text-sm text-muted-foreground">No apps installed.</div> : null}
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Email configuration (simulator)</div>
            <div className="mt-2 space-y-2">
              <Label>Support email</Label>
              <Input value={emailSupportEmail} onChange={(e) => setEmailSupportEmail(e.target.value)} />
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>IMAP host</Label>
                  <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
                </div>
                <div>
                  <Label>IMAP port</Label>
                  <Input value={String(imapPort)} onChange={(e) => setImapPort(parseInt(e.target.value || "0", 10))} />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>SMTP host</Label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                </div>
                <div>
                  <Label>SMTP port</Label>
                  <Input value={String(smtpPort)} onChange={(e) => setSmtpPort(parseInt(e.target.value || "0", 10))} />
                </div>
              </div>
              <Label>Username</Label>
              <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} />
              <Label>Password secret</Label>
              <Input value={smtpPasswordSecret} onChange={(e) => setSmtpPasswordSecret(e.target.value)} type="password" />
              <Button onClick={() => void upsertEmailConfig()} disabled={busy} className="w-full">
                Save email config
              </Button>
            </div>
          </div>

          {emailConfig ? (
            <div className="rounded border p-2 text-sm text-muted-foreground">
              Loaded: {emailConfig.support_email}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}


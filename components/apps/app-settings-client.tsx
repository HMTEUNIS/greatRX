"use client";

import * as React from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JsonSchema = {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
};

type AppPayload = {
  id: string;
  name: string;
  version: string;
  location: string;
  iframe_url: string;
  manifest_json: any;
};

const SaveSchema = z.object({
  settings: z.record(z.unknown())
});

function coerceInitialValue(fieldSchema: any, current: unknown) {
  if (current !== undefined) return current;
  if (fieldSchema && typeof fieldSchema === "object" && fieldSchema.default !== undefined) return fieldSchema.default;
  if (fieldSchema?.type === "boolean") return false;
  if (fieldSchema?.type === "number" || fieldSchema?.type === "integer") return 0;
  if (fieldSchema?.type === "array") return [];
  return "";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function AppSettingsClient({ appId }: { appId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [app, setApp] = React.useState<AppPayload | null>(null);

  const [schema, setSchema] = React.useState<JsonSchema | null>(null);
  const [settings, setSettings] = React.useState<Record<string, unknown>>({});
  const [rawJson, setRawJson] = React.useState<string>("{}");
  const [mode, setMode] = React.useState<"form" | "json">("form");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/apps/${encodeURIComponent(appId)}/settings`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load settings");

      const appPayload = data.app as AppPayload;
      const currentSettings = (data.settings ?? {}) as Record<string, unknown>;

      const inferredSchema = (appPayload?.manifest_json?.settings_schema ?? null) as JsonSchema | null;
      setApp(appPayload);
      setSchema(inferredSchema && typeof inferredSchema === "object" ? inferredSchema : null);

      // Initialize settings with defaults from schema (if provided).
      if (inferredSchema?.properties && typeof inferredSchema.properties === "object") {
        const next: Record<string, unknown> = { ...currentSettings };
        for (const [k, fieldSchema] of Object.entries(inferredSchema.properties)) {
          next[k] = coerceInitialValue(fieldSchema, next[k]);
        }
        setSettings(next);
        setRawJson(JSON.stringify(next, null, 2));
        setMode("form");
      } else {
        setSettings(currentSettings);
        setRawJson(JSON.stringify(currentSettings, null, 2));
        setMode("json");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  function updateField(key: string, value: unknown) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      setRawJson(JSON.stringify(next, null, 2));
      return next;
    });
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      let toSave: Record<string, unknown> = settings;
      if (mode === "json") {
        const parsed = JSON.parse(rawJson);
        if (!isPlainObject(parsed)) throw new Error("Settings JSON must be an object");
        toSave = parsed;
      }

      const validated = SaveSchema.safeParse({ settings: toSave });
      if (!validated.success) throw new Error(validated.error.issues[0]?.message ?? "Invalid settings");

      const res = await fetch(`/api/v2/apps/${encodeURIComponent(appId)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: validated.data.settings })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to save settings");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : null;
  const required = new Set<string>(Array.isArray(schema?.required) ? schema!.required! : []);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{app ? `${app.name} settings` : "App settings"}</h1>
          <p className="text-sm text-muted-foreground">
            {app ? `v${app.version} · ${app.location}` : "Configure app settings for your organization."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading || saving}>
            Refresh
          </Button>
          <Button onClick={() => void save()} disabled={loading || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-[1fr,360px]">
        <Card className="p-4">
          {loading ? <div className="text-sm text-muted-foreground">Loading...</div> : null}

          {!loading ? (
            properties ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{schema?.title ?? "Settings"}</div>
                    {schema?.description ? <div className="text-xs text-muted-foreground">{schema.description}</div> : null}
                  </div>
                  <Button variant="secondary" onClick={() => setMode(mode === "form" ? "json" : "form")} disabled={saving}>
                    {mode === "form" ? "Edit JSON" : "Edit form"}
                  </Button>
                </div>

                {mode === "json" ? (
                  <textarea
                    className="min-h-[360px] w-full rounded-md border border-border bg-background p-2 text-sm font-mono"
                    value={rawJson}
                    onChange={(e) => setRawJson(e.target.value)}
                  />
                ) : (
                  <div className="space-y-4">
                    {Object.entries(properties).map(([key, fieldSchema]) => {
                      const fieldType = fieldSchema?.type;
                      const title = fieldSchema?.title ?? key;
                      const desc = fieldSchema?.description as string | undefined;
                      const isRequired = required.has(key);
                      const currentValue = settings[key];

                      // enum -> select
                      if (Array.isArray(fieldSchema?.enum)) {
                        const options = fieldSchema.enum.filter((v: unknown) => typeof v === "string" || typeof v === "number");
                        return (
                          <div key={key} className="space-y-2">
                            <Label>
                              {title}
                              {isRequired ? <span className="text-red-600"> *</span> : null}
                            </Label>
                            <select
                              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                              value={typeof currentValue === "string" || typeof currentValue === "number" ? String(currentValue) : ""}
                              onChange={(e) => updateField(key, e.target.value)}
                              disabled={saving}
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {options.map((opt: any) => (
                                <option key={String(opt)} value={String(opt)}>
                                  {String(opt)}
                                </option>
                              ))}
                            </select>
                            {desc ? <div className="text-xs text-muted-foreground">{desc}</div> : null}
                          </div>
                        );
                      }

                      if (fieldType === "boolean") {
                        return (
                          <div key={key} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                id={key}
                                type="checkbox"
                                checked={Boolean(currentValue)}
                                onChange={(e) => updateField(key, e.target.checked)}
                                disabled={saving}
                              />
                              <Label htmlFor={key}>
                                {title}
                                {isRequired ? <span className="text-red-600"> *</span> : null}
                              </Label>
                            </div>
                            {desc ? <div className="text-xs text-muted-foreground">{desc}</div> : null}
                          </div>
                        );
                      }

                      if (fieldType === "number" || fieldType === "integer") {
                        return (
                          <div key={key} className="space-y-2">
                            <Label htmlFor={key}>
                              {title}
                              {isRequired ? <span className="text-red-600"> *</span> : null}
                            </Label>
                            <Input
                              id={key}
                              type="number"
                              value={typeof currentValue === "number" ? String(currentValue) : currentValue === undefined ? "" : String(currentValue)}
                              onChange={(e) => updateField(key, e.target.value === "" ? null : Number(e.target.value))}
                              disabled={saving}
                            />
                            {desc ? <div className="text-xs text-muted-foreground">{desc}</div> : null}
                          </div>
                        );
                      }

                      // default -> string
                      return (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={key}>
                            {title}
                            {isRequired ? <span className="text-red-600"> *</span> : null}
                          </Label>
                          <Input
                            id={key}
                            value={typeof currentValue === "string" ? currentValue : currentValue === undefined || currentValue === null ? "" : String(currentValue)}
                            onChange={(e) => updateField(key, e.target.value)}
                            disabled={saving}
                          />
                          {desc ? <div className="text-xs text-muted-foreground">{desc}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Settings (raw JSON)</div>
                    <div className="text-xs text-muted-foreground">
                      This app has no `manifest_json.settings_schema`. Edit JSON directly.
                    </div>
                  </div>
                </div>
                <textarea
                  className="min-h-[360px] w-full rounded-md border border-border bg-background p-2 text-sm font-mono"
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  disabled={saving}
                />
              </div>
            )
          ) : null}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">App metadata</div>
          <div className="text-xs text-muted-foreground">These are read-only (from `apps.manifest_json`).</div>
          <div className="rounded border p-2 text-xs">
            <div className="text-muted-foreground">App ID</div>
            <div className="break-all">{appId}</div>
          </div>
          <div className="rounded border p-2 text-xs">
            <div className="text-muted-foreground">iframe_url</div>
            <div className="break-all">{app?.iframe_url ?? "-"}</div>
          </div>
          <div className="rounded border p-2 text-xs">
            <div className="text-muted-foreground">Schema source</div>
            <div>{properties ? "`manifest_json.settings_schema`" : "none (raw JSON editor)"}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}


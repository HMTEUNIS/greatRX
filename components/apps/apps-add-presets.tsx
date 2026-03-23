"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isLiveDemoModeClient } from "@/lib/runtime/live-demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Preset = "retool" | "google_sheets";

function extractGoogleSheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}

function buildGoogleSheetsEmbedUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit?rm=minimal&widget=true&headers=false`;
}

function normalizeHttpsUrl(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return `https://${t}`;
}

const menuItemClass =
  "cursor-pointer rounded-md px-4 py-3 text-base font-medium outline-none hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted min-h-[3rem] flex items-center";

export function AppsAddPresets({ canAddApps, onAdded }: { canAddApps: boolean; onAdded: () => void }) {
  const liveDemo = isLiveDemoModeClient();
  const canUse = canAddApps && !liveDemo;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [preset, setPreset] = React.useState<Preset | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Retool
  const [retoolName, setRetoolName] = React.useState("Retool");
  const [retoolFullUrl, setRetoolFullUrl] = React.useState("");
  const [retoolSubdomain, setRetoolSubdomain] = React.useState("");
  const [retoolAppPath, setRetoolAppPath] = React.useState("");

  // Sheets
  const [sheetsName, setSheetsName] = React.useState("Google Sheet");
  const [sheetsInput, setSheetsInput] = React.useState("");


  function openPreset(p: Preset) {
    queueMicrotask(() => {
      setPreset(p);
      setError(null);
      setDialogOpen(true);
    });
  }

  function closeDialog() {
    setDialogOpen(false);
    setPreset(null);
    setError(null);
  }

  async function installAppRow(params: {
    name: string;
    iframe_url: string;
    manifest: Record<string, unknown>;
  }) {
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { data: me, error: meErr } = await supabase.from("users").select("organization_id").eq("id", uid).maybeSingle();
      if (meErr) throw meErr;
      const orgId = me?.organization_id;
      if (!orgId) throw new Error("No organization assigned to your user.");

      let url: URL;
      try {
        url = new URL(params.iframe_url);
      } catch {
        throw new Error("Invalid URL — check the address and try again.");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("URL must use http or https.");
      }

      const { error: insErr } = await supabase.from("apps").insert({
        organization_id: orgId,
        name: params.name.trim() || "Embedded app",
        version: "1.0.0",
        location: "sidebar",
        iframe_url: url.toString(),
        manifest_json: {
          ...params.manifest,
          quick_add: true
        }
      });
      if (insErr) {
        if (insErr.message.includes("unique") || insErr.code === "23505") {
          throw new Error("An app with this iframe URL already exists for your organization.");
        }
        throw insErr;
      }
      closeDialog();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add app");
    } finally {
      setBusy(false);
    }
  }

  async function submitRetool(e: React.FormEvent) {
    e.preventDefault();
    const full = retoolFullUrl.trim();
    let iframe_url: string;
    let manifest: Record<string, unknown>;

    if (full) {
      const u = normalizeHttpsUrl(full);
      if (!u) {
        setError("Enter a valid Retool URL (https://…).");
        return;
      }
      iframe_url = u;
      manifest = { preset: "retool", retool_url_mode: "full" };
    } else {
      const sub = retoolSubdomain.trim().replace(/^https?:\/\//, "").replace(/\.retool\.com.*$/i, "").replace(/\/$/, "");
      const path = retoolAppPath.trim().replace(/^\//, "");
      if (!sub || !path) {
        setError("Either paste a full Retool URL, or enter team subdomain + app path.");
        return;
      }
      iframe_url = `https://${sub}.retool.com/${path}`;
      manifest = { preset: "retool", retool_team: sub, retool_path: path };
    }

    await installAppRow({
      name: retoolName.trim() || "Retool",
      iframe_url,
      manifest
    });
  }

  async function submitSheets(e: React.FormEvent) {
    e.preventDefault();
    const id = extractGoogleSheetId(sheetsInput);
    if (!id) {
      setError("Paste a Google Sheets link or the spreadsheet ID from the URL.");
      return;
    }
    await installAppRow({
      name: sheetsName.trim() || "Google Sheet",
      iframe_url: buildGoogleSheetsEmbedUrl(id),
      manifest: { preset: "google_sheets", spreadsheet_id: id }
    });
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="h-12 w-12 shrink-0 p-0"
            disabled={!canUse}
            title={liveDemo ? "Live demo mode: adding apps is disabled" : "Add app"}
            aria-label="Add app"
          >
            <Plus className="h-7 w-7" strokeWidth={2.25} />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={clsx(
              "z-[100] min-w-[min(100vw-2rem,280px)] rounded-lg border border-border bg-background p-2 shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out"
            )}
            sideOffset={8}
            align="end"
            avoidCollisions
          >
            <DropdownMenu.Item className={menuItemClass} onSelect={() => openPreset("retool")}>
              Retool
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => openPreset("google_sheets")}>
              Google Sheets
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out" />
          <Dialog.Content
            className={clsx(
              "fixed left-1/2 top-1/2 z-[120] w-[min(100vw-2rem,32rem)] max-h-[min(90vh,44rem)] -translate-x-1/2 -translate-y-1/2",
              "overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out"
            )}
          >
            <Dialog.Title className="text-xl font-semibold">
              {preset === "retool" && "Add Retool app"}
              {preset === "google_sheets" && "Add Google Sheet"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-base text-muted-foreground">
              {preset === "retool" &&
                "Builds an iframe URL from your Retool team subdomain and app path, or use a full URL for custom domains. You must be signed into Retool (or use a public/embed-capable app) for the iframe to load."}
              {preset === "google_sheets" &&
                "Embeds the spreadsheet in a compact editor view. Share the sheet with people who should see it; Google’s own iframe rules still apply."}
            </Dialog.Description>

            {error ? (
              <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-base text-red-700">{error}</div>
            ) : null}

            {preset === "retool" ? (
              <form className="mt-5 space-y-4" onSubmit={(e) => void submitRetool(e)}>
                <div className="space-y-2">
                  <Label htmlFor="retool-name" className="text-base">
                    Display name
                  </Label>
                  <Input
                    id="retool-name"
                    className="h-11 text-base"
                    value={retoolName}
                    onChange={(e) => setRetoolName(e.target.value)}
                    placeholder="Retool"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retool-full" className="text-base">
                    Full app URL (optional)
                  </Label>
                  <Input
                    id="retool-full"
                    className="h-11 text-base"
                    value={retoolFullUrl}
                    onChange={(e) => setRetoolFullUrl(e.target.value)}
                    placeholder="https://your-team.retool.com/apps/…"
                  />
                  <p className="text-sm text-muted-foreground">
                    If set, this overrides subdomain + path below (custom domains, regions, etc.).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retool-sub" className="text-base">
                    Team subdomain
                  </Label>
                  <Input
                    id="retool-sub"
                    className="h-11 text-base"
                    value={retoolSubdomain}
                    onChange={(e) => setRetoolSubdomain(e.target.value)}
                    placeholder="acme (from acme.retool.com)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retool-path" className="text-base">
                    App path
                  </Label>
                  <Input
                    id="retool-path"
                    className="h-11 text-base"
                    value={retoolAppPath}
                    onChange={(e) => setRetoolAppPath(e.target.value)}
                    placeholder="apps/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <p className="text-sm text-muted-foreground">
                    Copy the path from your browser after <code className="rounded bg-muted px-1 py-0.5">.retool.com/</code> (include{" "}
                    <code className="rounded bg-muted px-1 py-0.5">apps/…</code>).
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <Button type="button" variant="secondary" className="min-h-11 min-w-[6rem] text-base" onClick={closeDialog} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="submit" className="min-h-11 min-w-[7rem] text-base" disabled={busy}>
                    {busy ? "Adding…" : "Add app"}
                  </Button>
                </div>
              </form>
            ) : null}

            {preset === "google_sheets" ? (
              <form className="mt-5 space-y-4" onSubmit={(e) => void submitSheets(e)}>
                <div className="space-y-2">
                  <Label htmlFor="sheets-name" className="text-base">
                    Display name
                  </Label>
                  <Input
                    id="sheets-name"
                    className="h-11 text-base"
                    value={sheetsName}
                    onChange={(e) => setSheetsName(e.target.value)}
                    placeholder="Ops metrics"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sheets-link" className="text-base">
                    Spreadsheet URL or ID
                  </Label>
                  <Input
                    id="sheets-link"
                    className="h-11 text-base"
                    value={sheetsInput}
                    onChange={(e) => setSheetsInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <Button type="button" variant="secondary" className="min-h-11 min-w-[6rem] text-base" onClick={closeDialog} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="submit" className="min-h-11 min-w-[7rem] text-base" disabled={busy}>
                    {busy ? "Adding…" : "Add app"}
                  </Button>
                </div>
              </form>
            ) : null}

          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

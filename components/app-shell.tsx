"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { SessionBadge } from "@/components/auth/session-badge";

type NavItem = { href: string; label: string; shortcut?: string };

const NAV: NavItem[] = [
  { href: "/tickets", label: "Tickets", shortcut: "g t" },
  { href: "/tickets#ticket-intake", label: "Ticket Intake", shortcut: "g i" },
  { href: "/apps", label: "Apps", shortcut: "g a" },
  { href: "/webhooks", label: "Webhooks", shortcut: "g w" },
  { href: "/automations", label: "Automations", shortcut: "g r" },
  { href: "/admin", label: "Admin", shortcut: "g d" }
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="secondary"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="px-2"
    >
      {theme === "dark" ? "Dark" : "Light"}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isPublicAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  React.useEffect(() => {
    if (isPublicAuthPage) return;

    // Simple keyboard shortcuts: press `g` then a second key.
    let chord: string | null = null;
    const timeoutMs = 900;
    let t: number | null = null;

    function reset() {
      chord = null;
      if (t) window.clearTimeout(t);
      t = null;
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("contenteditable") === "true")) return;

      if (e.key.toLowerCase() === "escape") {
        reset();
        return;
      }

      if (!chord) {
        if (e.key.toLowerCase() === "g") {
          chord = "g";
          t = window.setTimeout(() => reset(), timeoutMs);
        }
        return;
      }

      if (chord === "g") {
        const k = e.key.toLowerCase();
        if (k === "t") router.push("/tickets");
        else if (k === "i") router.push("/tickets#ticket-intake");
        else if (k === "a") router.push("/apps");
        else if (k === "w") router.push("/webhooks");
        else if (k === "r") router.push("/automations");
        else if (k === "d") router.push("/admin");
        reset();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPublicAuthPage, router]);

  if (isPublicAuthPage) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="hidden w-64 border-r p-4 md:block">
          <div className="mb-4">
            <div className="text-lg font-semibold">ZenGarden</div>
            <div className="text-xs text-muted-foreground">Zendesk simulator</div>
          </div>

          <nav aria-label="Primary" className="space-y-1">
            {NAV.map((item) => {
              const normalizedHref = item.href.split("#")[0] ?? item.href;
              const active =
                pathname === normalizedHref || (normalizedHref !== "/admin" && pathname.startsWith(normalizedHref));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center justify-between rounded px-2 py-2 text-sm transition-colors",
                    active ? "bg-muted font-medium" : "hover:bg-muted"
                  ].join(" ")}
                >
                  <span>{item.label}</span>
                  {item.shortcut ? <span className="text-[11px] text-muted-foreground">{item.shortcut}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 flex justify-between items-center">
            <ThemeToggle />
            <div className="text-xs text-muted-foreground">Shortcuts: g + key</div>
          </div>

          <div className="mt-2">
            <SessionBadge />
          </div>
        </aside>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}


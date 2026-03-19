"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = React.useState("/tickets");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get("next") ?? "/tickets");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <Card className="p-6">
        <h1 className="mb-2 text-xl font-semibold">Log in</h1>
        <p className="mb-4 text-sm text-muted-foreground">Use your Admin/Agent credentials.</p>

        <div className="mb-4 rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-900">
          <div className="font-medium">Demo login (read-only)</div>
          <div className="mt-1 text-xs text-yellow-900/80">Email: demo@zengarden.dummy</div>
          <div className="text-xs text-yellow-900/80">
            Password: Demo1234! (or whatever you set when creating the demo user)
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}


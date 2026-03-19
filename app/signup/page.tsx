"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export default function SignupPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = React.useState("/tickets");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get("next") ?? "/tickets");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const parsed = SignupSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      // If email confirmation is enabled, Supabase often returns `session: null`.
      // In that case, we cannot rely on middleware auth and we should prompt the user.
      if (data?.session) {
        router.replace(nextPath);
        return;
      }

      setInfo(
        "Account created. If your Supabase project requires email confirmation, please check your inbox to confirm, then log in."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <Card className="p-6">
        <h1 className="mb-2 text-xl font-semibold">Create account</h1>
        <p className="mb-4 text-sm text-muted-foreground">You can seed roles in demo mode.</p>

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
          {info ? <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-900">{info}</div> : null}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating..." : "Create account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}


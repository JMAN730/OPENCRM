"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { trpc } from "@/app/_trpc/client";
import { AuthCard, AuthShell } from "@/components/layout/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const register = trpc.auth.register.useMutation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const organizationName = form.get("organizationName") as string;

    try {
      await register.mutateAsync({
        name,
        email,
        password,
        organizationName: organizationName || undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setIsLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Account created but sign-in failed. Please sign in manually.");
      router.push("/auth/signin");
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <AuthShell>
      <AuthCard className="space-y-6">
        <div className="text-center">
          <div
            className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-[var(--crm-radius-sm,10px)] text-sm font-bold"
            style={{
              background: "var(--crm-fg, #1a1714)",
              color: "var(--crm-surface, #f4eee2)",
              boxShadow: "var(--crm-shadow-clay-sm)",
            }}
          >
            C
          </div>
          <h1 className="crm-auth-title">Create your account</h1>
          <p className="crm-auth-sub">Get started with OpenCRM</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" placeholder="Jane Smith" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization name</Label>
            <Input id="organizationName" name="organizationName" placeholder="Acme Inc." />
            <p className="text-xs crm-auth-sub">Leave blank to use your name</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="jane@acme.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
            <p className="text-xs crm-auth-sub">At least 8 characters</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm crm-auth-sub">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-foreground hover:underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}

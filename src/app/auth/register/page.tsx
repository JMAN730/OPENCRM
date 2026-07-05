"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, AuthCard } from "@/features/auth/components/AuthShell";
import Link from "next/link";
import { trpc } from "@/app/_trpc/client";

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
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setIsLoading(false);
      return;
    }

    // Auto sign-in after registration
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
      <AuthCard>
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground text-sm font-bold">
            C
          </div>
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted-foreground">Get started with OpenCRM</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" placeholder="Jane Smith" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization name</Label>
            <Input id="organizationName" name="organizationName" placeholder="Acme Inc." />
            <p className="text-xs text-muted-foreground">Leave blank to use your name</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="jane@acme.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
            <p className="text-xs text-muted-foreground">At least 8 characters</p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-foreground hover:underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}

"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, AuthCard } from "@/features/auth/components/AuthShell";
import Link from "next/link";
import { trpc } from "@/app/_trpc/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const confirm_ = trpc.auth.confirmResetPassword.useMutation({
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err.message),
  });

  if (!token) {
    return (
      <AuthShell>
        <AuthCard
          title="Invalid link"
          description="This password reset link is missing or malformed."
        >
          <div className="flex justify-center">
            <Link href="/auth/signin" className="text-sm underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell>
        <AuthCard
          title="Password updated"
          description="Your password has been reset. You can now sign in."
        >
          <div className="flex justify-center">
            <Button onClick={() => router.push("/auth/signin")}>Sign in</Button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    confirm_.mutate({ token, password });
  };

  return (
    <AuthShell>
      <AuthCard
        title="Set new password"
        description="Enter a new password for your account."
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoFocus
                required
                minLength={8}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              />
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Button className="w-full" type="submit" disabled={confirm_.isPending}>
              {confirm_.isPending ? "Saving..." : "Reset password"}
            </Button>
            <Link
              href="/auth/signin"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

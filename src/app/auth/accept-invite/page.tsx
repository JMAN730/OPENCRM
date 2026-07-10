"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, AuthCard } from "@/features/auth/components/AuthShell";
import Link from "next/link";
import { trpc } from "@/app/_trpc/client";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: invitation, isLoading } = trpc.teams.getInvitation.useQuery(
    { token },
    { enabled: Boolean(token), retry: false },
  );

  const accept = trpc.teams.acceptInvitation.useMutation({
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err.message),
  });

  if (!token) {
    return (
      <MessageCard
        title="Invalid link"
        description="This invitation link is missing or malformed."
      >
        <Link href="/auth/signin" className="text-sm underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </MessageCard>
    );
  }

  if (isLoading) {
    return <MessageCard title="Checking invitation…" />;
  }

  if (!invitation) {
    return (
      <MessageCard
        title="Invitation expired"
        description="This invitation link is no longer valid. Ask your admin to send a new one."
      >
        <Link href="/auth/signin" className="text-sm underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </MessageCard>
    );
  }

  if (success) {
    return (
      <MessageCard
        title="You're in"
        description="Your account is ready. Sign in to start working."
      >
        <Button onClick={() => router.push("/auth/signin")}>Sign in</Button>
      </MessageCard>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    accept.mutate({ token, name, password });
  };

  return (
    <AuthShell>
      <AuthCard
        title={`Join ${invitation.organizationName}`}
        description={
          <>
            Set a password to accept this invitation for <strong>{invitation.email}</strong>.
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                type="text"
                autoFocus
                required
                value={name || invitation.name || ""}
                onChange={(e) => { setName(e.target.value); setError(""); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
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
          <div className="mt-6 flex flex-col gap-3">
            <Button className="w-full" type="submit" disabled={accept.isPending}>
              {accept.isPending ? "Joining…" : "Accept invitation"}
            </Button>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

function MessageCard({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <AuthShell>
      <AuthCard title={title} description={description}>
        {children ? <div className="flex justify-center">{children}</div> : null}
      </AuthCard>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AuthShell />}>
      <AcceptInviteForm />
    </Suspense>
  );
}

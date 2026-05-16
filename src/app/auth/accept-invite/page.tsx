"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <CenteredCard>
        <CardHeader>
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>This invitation link is missing or malformed.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/auth/signin" className="text-sm underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </CenteredCard>
    );
  }

  if (isLoading) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle>Checking invitation…</CardTitle>
        </CardHeader>
      </CenteredCard>
    );
  }

  if (!invitation) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle>Invitation expired</CardTitle>
          <CardDescription>
            This invitation link is no longer valid. Ask your admin to send a new one.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/auth/signin" className="text-sm underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </CenteredCard>
    );
  }

  if (success) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle>You&apos;re in</CardTitle>
          <CardDescription>Your account is ready. Sign in to start working.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button onClick={() => router.push("/auth/signin")}>Sign in</Button>
        </CardFooter>
      </CenteredCard>
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
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-sm border-none shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Join {invitation.organizationName}</CardTitle>
          <CardDescription>
            Set a password to accept this invitation for <strong>{invitation.email}</strong>.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
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
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t-0 bg-transparent">
            <Button className="w-full" type="submit" disabled={accept.isPending}>
              {accept.isPending ? "Joining…" : "Accept invitation"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-sm border-none shadow-lg text-center">{children}</Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}

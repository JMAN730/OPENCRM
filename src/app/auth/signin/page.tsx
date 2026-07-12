"use client";

import { signIn, getSession, useSession } from "next-auth/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, AuthCard } from "@/features/auth/components/AuthShell";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { X, UserPlus, ArrowLeft } from "lucide-react";
import { trpc } from "@/app/_trpc/client";

type SavedUser = {
  email: string;
  name: string;
  image?: string | null;
};

const STORAGE_KEY = "crm_saved_users";
const STORAGE_EVENT = "crm-saved-users-changed";

function getSavedUsers(): SavedUser[] {
  try {
    return JSON.parse(getSavedUsersSnapshot());
  } catch {
    return [];
  }
}

function getSavedUsersSnapshot() {
  if (typeof window === "undefined") return "[]";
  return localStorage.getItem(STORAGE_KEY) ?? "[]";
}

function emitSavedUsersChanged() {
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function subscribeToSavedUsers(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORAGE_EVENT, onStoreChange);
  };
}

function upsertSavedUser(user: SavedUser) {
  const rest = getSavedUsers().filter((u) => u.email !== user.email);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([user, ...rest]));
  emitSavedUsersChanged();
}

function removeSavedUser(email: string) {
  const users = getSavedUsers().filter((u) => u.email !== email);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  emitSavedUsersChanged();
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function SignInPage() {
  const { status } = useSession();
  const router = useRouter();
  const savedUsersSnapshot = useSyncExternalStore(subscribeToSavedUsers, getSavedUsersSnapshot, () => "[]");
  const savedUsers = useMemo(() => {
    try {
      return JSON.parse(savedUsersSnapshot) as SavedUser[];
    } catch {
      return [];
    }
  }, [savedUsersSnapshot]);
  const hasSavedUsers = savedUsers.length > 0;

  const [viewOverride, setViewOverride] = useState<"picker" | "password" | "new" | null>(null);
  const [selectedUser, setSelectedUser] = useState<SavedUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setResetSuccess(true),
    onError: (err) => setError(err.message),
  });

  const handleResetPassword = () => {
    const emailToReset = view === "password" && selectedUser ? selectedUser.email : email;
    if (!emailToReset) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setResetSuccess(false);
    resetPasswordMutation.mutate({ email: emailToReset });
  };

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  const view = viewOverride ?? (hasSavedUsers ? "picker" : "new");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const loginEmail = view === "password" ? selectedUser!.email : email;

    try {
      const result = await signIn("credentials", {
        email: loginEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          view === "password"
            ? "Incorrect password. Please try again."
            : "Incorrect email or password. Please try again."
        );
      } else {
        const session = await getSession();
        // Only persist the account picker entry when the user explicitly opts
        // in (default off) or when they're re-signing in to a previously
        // remembered account — otherwise this leaks the user's identity to
        // anyone with browser access on a shared machine.
        const shouldRemember =
          view === "password" || rememberOnDevice;
        if (shouldRemember && session?.user?.email) {
          upsertSavedUser({
            email: session.user.email,
            name: session.user.name ?? session.user.email,
            image: session.user.image,
          });
        }
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectUser = (user: SavedUser) => {
    setSelectedUser(user);
    setPassword("");
    setError("");
    setViewOverride("password");
  };

  const handleRemoveUser = (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedUser(email);
    if (selectedUser?.email === email) {
      setSelectedUser(null);
    }
    setViewOverride(null);
  };

  const handleBack = () => {
    setError("");
    setPassword("");
    setSelectedUser(null);
    setViewOverride(null);
  };

  if (status === "loading")
    return (
      <AuthShell>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </AuthShell>
    );

  // ── Account picker ──────────────────────────────────────────────────────────
  if (view === "picker") {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-10 w-full max-w-lg">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="mt-1 text-muted-foreground">Select your account to continue</p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {savedUsers.map((user) => (
              <div
                key={user.email}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectUser(user)}
                onKeyDown={(e) => e.key === "Enter" && handleSelectUser(user)}
                className="group relative flex w-32 cursor-pointer flex-col items-center gap-3 rounded-xl p-4 transition-all duration-150 hover:bg-card hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <button
                  onClick={(e) => handleRemoveUser(user.email, e)}
                  className="absolute right-2 top-2 rounded-full bg-muted p-0.5 opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  aria-label="Remove account"
                >
                  <X className="h-3 w-3" />
                </button>
                <Avatar className="h-16 w-16 text-lg">
                  {user.image && <AvatarImage src={user.image} alt={user.name} />}
                  <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="text-center text-sm font-medium leading-tight">
                  {user.name}
                </span>
              </div>
            ))}

            <button
              onClick={() => { setEmail(""); setPassword(""); setError(""); setViewOverride("new"); }}
              className="flex w-32 flex-col items-center gap-3 rounded-xl p-4 transition-all duration-150 hover:bg-card hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40">
                <UserPlus className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Add account</span>
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  // ── Password prompt for saved user ──────────────────────────────────────────
  if (view === "password" && selectedUser) {
    return (
      <AuthShell>
        <AuthCard>
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <Avatar className="h-20 w-20 text-2xl">
              {selectedUser.image && (
                <AvatarImage src={selectedUser.image} alt={selectedUser.name} />
              )}
              <AvatarFallback>{getInitials(selectedUser.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold">{selectedUser.name}</h1>
              <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
            </div>
          </div>
          <form onSubmit={handleSignIn}>
            <div className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  required
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              {resetSuccess ? (
                <p className="text-center text-sm text-green-600">Password has been reset.</p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetPassword}
                  disabled={resetPasswordMutation.isPending}
                >
                  {resetPasswordMutation.isPending ? "Resetting..." : "Forgot password?"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to accounts
              </Button>
            </div>
          </form>
        </AuthCard>
      </AuthShell>
    );
  }

  // ── New account form ────────────────────────────────────────────────────────
  return (
    <AuthShell>
      <AuthCard
        title="Sign In"
        description="Enter your email and password to access your account"
      >
        <div className="mb-4">
          <GoogleSignInButton />
        </div>
        <form onSubmit={handleSignIn}>
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={rememberOnDevice}
                onChange={(e) => setRememberOnDevice(e.target.checked)}
              />
              Remember this account on this device
            </label>
          </div>
          <div className="mt-6 flex flex-col items-center gap-4">
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
            {resetSuccess ? (
              <p className="text-center text-sm text-green-600">Password has been reset.</p>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetPassword}
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? "Resetting..." : "Forgot password?"}
              </Button>
            )}
            {savedUsers.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to accounts
              </Button>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/register"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Create one
              </Link>
            </p>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

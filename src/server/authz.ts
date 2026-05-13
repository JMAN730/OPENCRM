import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";

export type UserRole = "ADMIN" | "MANAGER" | "USER";

export const ROLE_VALUES = ["ADMIN", "MANAGER", "USER"] as const;

export function isUserRole(value: unknown): value is UserRole {
  return value === "ADMIN" || value === "MANAGER" || value === "USER";
}

export function isAdmin(role: string | null | undefined): role is "ADMIN" {
  return role === "ADMIN";
}

export function isManagerOrAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function assertAdmin(role: string | null | undefined): asserts role is "ADMIN" {
  if (!isAdmin(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin privileges required." });
  }
}

export function assertManagerOrAdmin(role: string | null | undefined): void {
  if (!isManagerOrAdmin(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager or admin privileges required." });
  }
}

export type SessionUser = NonNullable<Session["user"]> & {
  id: string;
  role: UserRole;
  organizationId: string | null;
  teamId: string | null;
};

export function getSessionUser(session: Session | null | undefined): SessionUser {
  if (!session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return session.user as SessionUser;
}

/**
 * Only ADMIN can grant ADMIN. MANAGER can grant USER. USER cannot grant anything.
 * Throws FORBIDDEN if the grant would escalate privilege beyond the caller.
 */
export function assertCanGrantRole(callerRole: string, targetRole: UserRole): void {
  if (targetRole === "ADMIN" && !isAdmin(callerRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins can grant the ADMIN role.",
    });
  }
  if (targetRole === "MANAGER" && !isAdmin(callerRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins can grant the MANAGER role.",
    });
  }
  if (!isManagerOrAdmin(callerRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins or managers can grant roles.",
    });
  }
}

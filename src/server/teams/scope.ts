import type { PrismaClient } from "@prisma/client";
import { cached, invalidate } from "@/lib/cache";

export type LeadScope =
  | { kind: "all"; organizationId: string }
  | { kind: "users"; organizationId: string; userIds: string[] };

const SCOPE_TTL_SECONDS = 60;

function scopeKey(userId: string): string {
  return `scope:lead:${userId}`;
}

/**
 * Resolves which leads the given user is allowed to see.
 *
 *  - ADMIN: every lead in their organization.
 *  - Team leader: leads assigned to any member of any team they lead
 *    (plus their own).
 *  - Everyone else: only leads assigned to themselves.
 *
 * Hot path: called by 8+ procedures per user action. The result is cached
 * in Redis with a 60s TTL keyed on userId. Team membership changes call
 * `invalidateLeadScope(userId)` so the cache doesn't go stale.
 */
export async function resolveLeadScope(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
  role: string,
): Promise<LeadScope> {
  if (role === "ADMIN") {
    return { kind: "all", organizationId };
  }

  return cached<LeadScope>(
    { key: scopeKey(userId), ttl: SCOPE_TTL_SECONDS },
    async () => {
      const ledTeams = await prisma.team.findMany({
        where: { organizationId, leaderId: userId },
        select: { id: true, users: { select: { id: true } } },
      });

      if (ledTeams.length === 0) {
        return { kind: "users", organizationId, userIds: [userId] };
      }

      const ids = new Set<string>([userId]);
      for (const t of ledTeams) {
        for (const u of t.users) ids.add(u.id);
      }
      return { kind: "users", organizationId, userIds: Array.from(ids) };
    },
  );
}

/** Bust the Redis-cached scope for a user. Call after team membership writes. */
export async function invalidateLeadScope(userId: string): Promise<void> {
  await invalidate(scopeKey(userId));
}

/**
 * Per-request memoization wrapper. tRPC procedures often call resolveLeadScope
 * multiple times in the same request (e.g. notes + activities + lead read).
 * Stashing the promise on a per-request WeakMap keyed by the ctx object avoids
 * the duplicate Redis/DB round-trips even if the cache TTL is honoured.
 */
type ScopeCtx = {
  prisma: PrismaClient;
  organizationId: string;
  session: { user: { id: string; role: string } };
  __leadScope?: Map<string, Promise<LeadScope>>;
};

export function getLeadScope(ctx: ScopeCtx): Promise<LeadScope> {
  const orgId = ctx.organizationId;
  if (!orgId) throw new Error("getLeadScope requires ctx.organizationId");
  const { id: userId, role } = ctx.session.user;

  if (!ctx.__leadScope) ctx.__leadScope = new Map();
  const key = `${orgId}:${userId}`;
  const cachedPromise = ctx.__leadScope.get(key);
  if (cachedPromise) return cachedPromise;

  const p = resolveLeadScope(ctx.prisma, userId, orgId, role);
  ctx.__leadScope.set(key, p);
  return p;
}

/**
 * The one-call scoped `where`: derives the caller's identity from ctx and
 * returns the Prisma fragment restricting leads to what they may see.
 * Prefer this over the getLeadScope + leadWhereFromScope pair.
 */
export async function scopedLeadWhere(ctx: ScopeCtx) {
  return leadWhereFromScope(await getLeadScope(ctx));
}

/** Task counterpart of {@link scopedLeadWhere}. */
export async function scopedTaskWhere(ctx: ScopeCtx) {
  return taskWhereFromScope(await getLeadScope(ctx));
}

export function leadWhereFromScope(scope: LeadScope) {
  if (scope.kind === "all") {
    return { organizationId: scope.organizationId };
  }
  return {
    organizationId: scope.organizationId,
    assignedToId: { in: scope.userIds },
  };
}

/**
 * Prisma `where` fragment restricting which tasks a user may see, mirroring
 * the lead-scope rules. A task is visible when its owner (`userId`) or its
 * assignee (`assignedToId`) is in scope:
 *
 *  - ADMIN: every task in the organization.
 *  - Team leader: tasks owned by or assigned to any team member (plus their own).
 *  - Everyone else: only tasks they own or are assigned.
 */
function taskWhereFromScope(scope: LeadScope) {
  if (scope.kind === "all") {
    return { organizationId: scope.organizationId };
  }
  return {
    organizationId: scope.organizationId,
    OR: [
      { userId: { in: scope.userIds } },
      { assignedToId: { in: scope.userIds } },
    ],
  };
}

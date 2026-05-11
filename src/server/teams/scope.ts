import type { PrismaClient } from "@prisma/client";

export type LeadScope =
  | { kind: "all"; organizationId: string }
  | { kind: "users"; organizationId: string; userIds: string[] };

/**
 * Resolves which leads the given user is allowed to see.
 *
 *  - ADMIN: every lead in their organization.
 *  - Team leader: leads assigned to any member of any team they lead
 *    (plus their own).
 *  - Everyone else: only leads assigned to themselves.
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

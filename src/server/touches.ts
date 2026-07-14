import { Prisma } from "@prisma/client";

/**
 * A Touch is a recorded call attempt: a CALL_OUTCOME activity whose outcome
 * moved the lead out of NOT_CONTACTED. Touches are the source of every
 * "Calls" metric — see docs/adr/0002-call-metrics-from-activity-touches.md.
 */
export function touchWhere(organizationId?: string) {
  return {
    ...(organizationId ? { organizationId } : {}),
    type: "CALL_OUTCOME" as const,
    outcome: { not: "NOT_CONTACTED" as const },
  };
}

/**
 * Touch predicate as a Prisma.sql fragment for raw queries. Combines the type
 * and non-null outcome checks from touchWhere() — apply organization/date
 * filters separately in the consuming query.
 */
export function touchWhereSql(): Prisma.Sql {
  return Prisma.sql`a.type = 'CALL_OUTCOME' AND a.outcome IS NOT NULL AND a.outcome <> 'NOT_CONTACTED'`;
}

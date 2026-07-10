import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getLeadScope, leadWhereFromScope } from "@/server/teams/scope";

type LeadVisibilityCtx = {
  prisma: PrismaClient;
  organizationId: string;
  session: {
    user: {
      id: string;
      role: string;
    };
  };
};

/**
 * Lead visibility is the domain seam for Lead rows and Lead-related records.
 * Keep callers on this module instead of re-creating organization/team checks.
 */
export async function visibleLeadWhere(
  ctx: LeadVisibilityCtx,
): Promise<Prisma.LeadWhereInput> {
  const scope = await getLeadScope(ctx);
  return leadWhereFromScope(scope);
}

export async function requireVisibleLead<TArgs extends Omit<Prisma.LeadFindFirstArgs, "where">>(
  ctx: LeadVisibilityCtx,
  leadId: string,
  args?: TArgs,
): Promise<Prisma.LeadGetPayload<TArgs>> {
  const where = await visibleLeadWhere(ctx);
  const lead = await ctx.prisma.lead.findFirst({
    ...(args ?? {}),
    where: { ...where, id: leadId },
  });

  if (!lead) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
  }

  return lead as Prisma.LeadGetPayload<TArgs>;
}

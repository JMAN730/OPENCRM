import type { PrismaClient } from "@prisma/client";
import { ActivityType } from "@prisma/client";

export { ActivityType };

/**
 * Append an Activity row. Always populates organizationId by looking up the
 * lead's org — this is the only write path callers go through, so passing it
 * here keeps every Activity row org-scoped without callers needing to know.
 */
export async function logActivity(
  prisma: PrismaClient,
  args: {
    leadId: string;
    userId: string;
    type: ActivityType;
    description: string;
    /** Optional override when the caller already has it (saves a lookup). */
    organizationId?: string;
  },
) {
  try {
    const organizationId =
      args.organizationId ??
      (
        await prisma.lead.findUnique({
          where: { id: args.leadId },
          select: { organizationId: true },
        })
      )?.organizationId;

    await prisma.activity.create({
      data: {
        leadId: args.leadId,
        userId: args.userId,
        type: args.type,
        description: args.description,
        organizationId: organizationId ?? null,
      },
    });
  } catch (err) {
    console.error("[activity] failed to log", args.type, err);
  }
}

import type { PrismaClient } from "@prisma/client";
import { ActivityType } from "@prisma/client";

export { ActivityType };

export async function logActivity(
  prisma: PrismaClient,
  args: {
    leadId: string;
    userId: string;
    type: ActivityType;
    description: string;
  },
) {
  try {
    await prisma.activity.create({
      data: {
        leadId: args.leadId,
        userId: args.userId,
        type: args.type,
        description: args.description,
      },
    });
  } catch (err) {
    console.error("[activity] failed to log", args.type, err);
  }
}

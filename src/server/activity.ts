import type { PrismaClient } from "@prisma/client";

export type ActivityType =
  | "LEAD_CREATED"
  | "LEAD_ASSIGNED"
  | "LEAD_DELETED"
  | "CALL_OUTCOME"
  | "CALL_LOGGED"
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "NOTE_ADDED";

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

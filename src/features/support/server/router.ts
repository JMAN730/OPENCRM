import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { assertAdmin } from "@/server/authz";
import { assertWithinRateLimit } from "@/lib/rateLimit";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_PAGE_URL_LENGTH = 500;

export const supportRouter = createTRPCRouter({
  /**
   * Submit a bug / issue report. Available to every member of the org
   * (any role). Rate-limited per user so the channel can't be spammed.
   */
  submit: organizationProcedure
    .input(
      z.object({
        message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
        pageUrl: z.string().trim().max(MAX_PAGE_URL_LENGTH).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await assertWithinRateLimit({
        key: `support:submit:${userId}`,
        limit: 20,
        windowSeconds: 3600,
        message: "You've submitted several reports recently. Please try again later.",
      });

      const report = await ctx.prisma.bugReport.create({
        data: {
          organizationId: ctx.organizationId,
          submittedById: userId,
          message: input.message,
          pageUrl: input.pageUrl || null,
        },
        select: { id: true, createdAt: true },
      });

      return report;
    }),

  /**
   * List the organization's submitted reports, newest first. Admin-only:
   * reports may contain other members' words and context.
   */
  list: organizationProcedure.query(async ({ ctx }) => {
    assertAdmin((ctx.session.user as { role?: string }).role);

    return ctx.prisma.bugReport.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        message: true,
        pageUrl: true,
        createdAt: true,
        submittedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }),
});

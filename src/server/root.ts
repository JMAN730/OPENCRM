import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server"; // Import TRPCError

// Import other routers
import { leadsRouter } from "@/features/leads/server/router";
import { callsRouter } from "@/features/calls/server/router";
import { tasksRouter } from "@/features/tasks/server/router";
import { dashboardRouter } from "@/features/dashboard/server/router";

export const appRouter = createTRPCRouter({
  // Auth router for user-specific data
  auth: createTRPCRouter({
    me: protectedProcedure.query(({ ctx }) => {
      // Ensure user and organizationId are present
      const user = ctx.session?.user;
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      // We expect organizationId to be present due to authOptions logic
      const organizationId = (user as any).organizationId;
      if (!organizationId) {
        // This case should ideally be handled at login/user creation, but as a safeguard:
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User is not associated with an organization" });
      }
      return {
        id: (user as any).id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: (user as any).role,
        organizationId: organizationId,
      };
    }),
  }),

  // Leads router
  leads: leadsRouter,

  // Calls router
  calls: callsRouter,

  // Tasks router
  tasks: tasksRouter,

  // Dashboard router for KPIs and stats
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;

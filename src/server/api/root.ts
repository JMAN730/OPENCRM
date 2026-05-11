import { createTRPCRouter } from "@/server/trpc";
import { leadsRouter } from "@/features/leads/server/router";
import { callsRouter } from "@/features/calls/server/router";
import { scraperRouter } from "@/features/scraper/server/router";
import { tasksRouter } from "@/features/tasks/server/router";
import { dashboardRouter } from "@/features/dashboard/server/router";
import { authRouter } from "@/features/auth/server/router";
import { teamsRouter } from "@/features/teams/server/router";

export const appRouter = createTRPCRouter({
  leads: leadsRouter,
  calls: callsRouter,
  scraper: scraperRouter,
  tasks: tasksRouter,
  dashboard: dashboardRouter,
  auth: authRouter,
  teams: teamsRouter,
});

export type AppRouter = typeof appRouter;

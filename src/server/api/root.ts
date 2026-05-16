import { createTRPCRouter } from "@/server/trpc";
import { leadsRouter } from "@/features/leads/server/router";
import { callsRouter } from "@/features/calls/server/router";
import { scraperRouter } from "@/features/scraper/server/router";
import { tasksRouter } from "@/features/tasks/server/router";
import { dashboardRouter } from "@/features/dashboard/server/router";
import { authRouter } from "@/features/auth/server/router";
import { teamsRouter } from "@/features/teams/server/router";
import { scoringRouter } from "@/features/scoring/server/router";
import { websitesRouter } from "@/features/websites/server/router";
import { pipelineRouter } from "@/features/pipeline/server/router";

export const appRouter = createTRPCRouter({
  leads: leadsRouter,
  calls: callsRouter,
  scraper: scraperRouter,
  tasks: tasksRouter,
  dashboard: dashboardRouter,
  auth: authRouter,
  teams: teamsRouter,
  scoring: scoringRouter,
  websites: websitesRouter,
  pipeline: pipelineRouter,
});

export type AppRouter = typeof appRouter;

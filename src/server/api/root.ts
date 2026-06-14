import { createTRPCRouter } from "@/server/trpc";
import { aiRouter } from "@/features/ai/server/router";
import { leadsRouter } from "@/features/leads/server/router";
import { callsRouter } from "@/features/calls/server/router";
import { scraperRouter } from "@/features/scraper/server/router";
import { tasksRouter } from "@/features/tasks/server/router";
import { dashboardRouter } from "@/features/dashboard/server/router";
import { authRouter } from "@/features/auth/server/router";
import { teamsRouter } from "@/features/teams/server/router";
import { scoringRouter } from "@/features/scoring/server/router";
import { scriptsRouter } from "@/features/scripts/server/router";
import { websitesRouter } from "@/features/websites/server/router";
import { emailsRouter } from "@/features/emails/server/router";
import { pipelineRouter } from "@/features/pipeline/server/router";
import { analyticsRouter } from "@/features/analytics/server/router";
import { scheduledScraperRouter } from "@/features/scraper/server/scheduledRouter";

export const appRouter = createTRPCRouter({
  ai: aiRouter,
  leads: leadsRouter,
  calls: callsRouter,
  scraper: scraperRouter,
  scraperSchedules: scheduledScraperRouter,
  tasks: tasksRouter,
  dashboard: dashboardRouter,
  auth: authRouter,
  teams: teamsRouter,
  scoring: scoringRouter,
  scripts: scriptsRouter,
  websites: websitesRouter,
  emails: emailsRouter,
  pipeline: pipelineRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;

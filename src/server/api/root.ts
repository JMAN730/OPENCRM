import { createTRPCRouter } from "@/server/trpc";
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
import { smsRouter } from "@/features/sms/server/router";
import { pipelineRouter } from "@/features/pipeline/server/router";
import { analyticsRouter } from "@/features/analytics/server/router";
import { scheduledScraperRouter } from "@/features/scraper/server/scheduledRouter";
import { trainerRouter } from "@/features/trainer/server/router";
import { outreachRouter } from "@/features/outreach/server/router";
import { mapRouter } from "@/features/map/server/router";
import { billingRouter } from "@/features/billing/server/router";
import { platformRouter } from "@/features/admin/server/router";
import { messagesRouter } from "@/features/messages/server/router";

export const appRouter = createTRPCRouter({
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
  sms: smsRouter,
  pipeline: pipelineRouter,
  analytics: analyticsRouter,
  trainer: trainerRouter,
  outreach: outreachRouter,
  map: mapRouter,
  billing: billingRouter,
  platform: platformRouter,
  messages: messagesRouter,
});

export type AppRouter = typeof appRouter;

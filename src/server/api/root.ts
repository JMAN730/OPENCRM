import { createTRPCRouter } from "@/server/trpc";
import { leadsRouter } from "@/features/leads/server/router";
import { scraperRouter } from "@/features/scraper/server/router";

export const appRouter = createTRPCRouter({
  leads: leadsRouter,
  scraper: scraperRouter,
});

export type AppRouter = typeof appRouter;

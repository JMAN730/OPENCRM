import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { headers } from "next/headers";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/trpc";
import DashboardPageClient from "./DashboardPageClient";

export default async function DashboardPage() {
  const ctx = await createTRPCContext({ headers: await headers() });
  let state: DehydratedState | null = null;

  if (ctx.session) {
    const helpers = createServerSideHelpers({ router: appRouter, ctx });
    await Promise.all([
      helpers.dashboard.getKpiStats.prefetch(),
      helpers.tasks.getAll.prefetch({ limit: 50 }),
    ]);
    state = JSON.parse(JSON.stringify(helpers.dehydrate()));
  }

  return (
    <HydrationBoundary state={state}>
      <DashboardPageClient />
    </HydrationBoundary>
  );
}

import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { headers } from "next/headers";
import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeadsList } from "@/features/leads/components/LeadsList";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/trpc";

export default async function LeadsPage() {
  const ctx = await createTRPCContext({ headers: await headers() });
  let state: DehydratedState | null = null;

  if (ctx.session) {
    const helpers = createServerSideHelpers({ router: appRouter, ctx });
    await Promise.all([
      helpers.leads.getAll.prefetch({ search: "", limit: 100, cursor: undefined }),
      helpers.leads.getStatusCounts.prefetch({ search: "" }),
    ]);
    state = JSON.parse(JSON.stringify(helpers.dehydrate()));
  }

  return (
    <DashboardLayout>
      <HydrationBoundary state={state}>
        <Suspense fallback={null}>
          <LeadsList />
        </Suspense>
      </HydrationBoundary>
    </DashboardLayout>
  );
}

"use client";

import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { TrainerPanel } from "@/features/trainer/components/TrainerPanel";
import { TRAINER_ENABLED } from "@/lib/features";

export default function TrainerPage() {
  return (
    <DashboardLayout>
      {TRAINER_ENABLED ? (
        <Suspense fallback={null}>
          <TrainerPanel />
        </Suspense>
      ) : (
        <PageShell title="Trainer" subtitle="Coming soon">
          <div className="crm-empty">
            The voice call trainer is still being built and has been temporarily
            disabled. It will be back once it&apos;s finished.
          </div>
        </PageShell>
      )}
    </DashboardLayout>
  );
}

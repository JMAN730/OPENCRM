"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { ScriptsPanel } from "@/features/scripts/components/ScriptsPanel";

export default function ScriptsPage() {
  return (
    <DashboardLayout>
      <PageShell
        title="Sales Scripts"
        subtitle="Call scripts for your team. Managers can edit; everyone can reference them on calls."
      >
        <ScriptsPanel />
      </PageShell>
    </DashboardLayout>
  );
}

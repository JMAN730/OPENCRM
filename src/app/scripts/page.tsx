"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { ScriptsPanel } from "@/features/scripts/components/ScriptsPanel";
import { SCRIPTS_ENABLED } from "@/lib/features";

export default function ScriptsPage() {
  return (
    <DashboardLayout>
      {SCRIPTS_ENABLED ? (
        <PageShell
          title="Sales Scripts"
          subtitle="Call scripts for your team. Managers can edit; everyone can reference them on calls."
        >
          <ScriptsPanel />
        </PageShell>
      ) : (
        <PageShell title="Sales Scripts" subtitle="Coming soon">
          <div className="crm-empty">
            Sales scripts are still being built and have been temporarily
            disabled. They will be back once they&apos;re finished.
          </div>
        </PageShell>
      )}
    </DashboardLayout>
  );
}

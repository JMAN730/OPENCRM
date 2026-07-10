"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { ScoringRulesPanel } from "@/features/scoring/components/ScoringRulesPanel";

export default function ScoringSettingsPage() {
  return (
    <DashboardLayout>
      <PageShell
        title="Lead Scoring"
        subtitle="Configure how leads are scored. Changes apply immediately to all leads."
      >
        <ScoringRulesPanel />
      </PageShell>
    </DashboardLayout>
  );
}

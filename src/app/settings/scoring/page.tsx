"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ScoringRulesPanel } from "@/features/scoring/components/ScoringRulesPanel";

export default function ScoringSettingsPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Lead Scoring</h1>
            <div className="crm-page-sub">
              Configure how leads are scored. Changes apply immediately to all leads.
            </div>
          </div>
        </div>
        <ScoringRulesPanel />
      </div>
    </DashboardLayout>
  );
}

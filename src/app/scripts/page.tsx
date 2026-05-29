"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ScriptsPanel } from "@/features/scripts/components/ScriptsPanel";

export default function ScriptsPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Sales Scripts</h1>
            <div className="crm-page-sub">
              Call scripts for your team. Managers can edit; everyone can reference them on calls.
            </div>
          </div>
        </div>
        <ScriptsPanel />
      </div>
    </DashboardLayout>
  );
}

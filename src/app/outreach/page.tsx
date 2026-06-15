"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { OutreachQueue } from "@/features/outreach/components/OutreachQueue";

export default function OutreachPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Outreach</h1>
            <div className="crm-page-sub">
              Auto-generated demo sites and email drafts · review and send
            </div>
          </div>
        </div>
        <OutreachQueue />
      </div>
    </DashboardLayout>
  );
}

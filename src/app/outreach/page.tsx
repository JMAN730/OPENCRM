"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { OutreachQueue } from "@/features/outreach/components/OutreachQueue";

export default function OutreachPage() {
  return (
    <DashboardLayout>
      <PageShell
        title="Outreach"
        subtitle="Auto-generated demo sites and email drafts · review and send"
      >
        <OutreachQueue />
      </PageShell>
    </DashboardLayout>
  );
}

"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { MessagesPanel } from "@/features/messages/components/MessagesPanel";

export default function MessagesPage() {
  return (
    <DashboardLayout>
      <PageShell
        title="Messages"
        subtitle="Direct messages with members of your organization"
      >
        <MessagesPanel />
      </PageShell>
    </DashboardLayout>
  );
}

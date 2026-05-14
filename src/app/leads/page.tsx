import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeadsList } from "@/features/leads/components/LeadsList";

export default function LeadsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <LeadsList />
      </Suspense>
    </DashboardLayout>
  );
}

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { LeadMap } from "@/features/map/components/LeadMap";

export default function MapPage() {
  return (
    <DashboardLayout>
      <PageShell
        title="Map"
        subtitle="Lead map · pan around, discover businesses, select pins and enrich their contact details"
      >
        <LeadMap />
      </PageShell>
    </DashboardLayout>
  );
}

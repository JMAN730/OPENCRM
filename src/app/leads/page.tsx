import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeadsList } from "@/features/leads/components/LeadsList";

export default function LeadsPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">
            Manage your leads and track their progress through the pipeline.
          </p>
        </div>
        
        <LeadsList />
      </div>
    </DashboardLayout>
  );
}

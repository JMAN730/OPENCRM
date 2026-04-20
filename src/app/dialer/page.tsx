import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Dialer } from "@/features/calls/components/Dialer";

export default function DialerPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Dialer</h1>
          <p className="text-muted-foreground mt-1">
            Make calls, track history, and manage your interactions in real-time.
          </p>
        </div>
        
        <Dialer />
      </div>
    </DashboardLayout>
  );
}

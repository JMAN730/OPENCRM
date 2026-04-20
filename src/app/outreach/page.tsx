import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Send, Plus } from "lucide-react";

export default function OutreachPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Outreach</h1>
            <p className="text-muted-foreground mt-1">
              Manage your email and SMS campaigns to reach more prospects.
            </p>
          </div>
          <Button className="gap-2">
            <Plus size={16} />
            New Campaign
          </Button>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center gap-4 border border-dashed border-border rounded-xl">
          <Send size={36} className="text-muted-foreground/20" />
          <div>
            <p className="text-sm font-medium">No campaigns yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a campaign to start reaching your leads.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 mt-2">
            <Plus size={14} />
            New Campaign
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

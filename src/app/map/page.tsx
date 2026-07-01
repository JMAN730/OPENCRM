import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeadMap } from "@/features/map/components/LeadMap";

export default function MapPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Map</h1>
            <div className="crm-page-sub">
              Lead map · pan around, discover businesses, select pins and enrich their contact details
            </div>
          </div>
        </div>
        <LeadMap />
      </div>
    </DashboardLayout>
  );
}

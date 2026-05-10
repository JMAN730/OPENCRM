import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ScraperPanel } from "@/features/scraper/components/ScraperPanel";

export default function ScraperPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Scraper</h1>
            <div className="crm-page-sub">Google Maps lead scraper · discover and import new prospects</div>
          </div>
        </div>
        <ScraperPanel />
      </div>
    </DashboardLayout>
  );
}

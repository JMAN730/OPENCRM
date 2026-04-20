import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ScraperPanel } from "@/features/scraper/components/ScraperPanel";

export default function ScraperPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lead Scraper</h1>
          <p className="text-muted-foreground mt-1">
            Run the Google Maps scraper to discover new businesses and import them as leads.
          </p>
        </div>
        <ScraperPanel />
      </div>
    </DashboardLayout>
  );
}

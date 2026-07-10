import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { ScraperPanel } from "@/features/scraper/components/ScraperPanel";

export default function ScraperPage() {
  return (
    <DashboardLayout>
      <PageShell
        title="Scraper"
        subtitle="Google Maps lead scraper · discover and import new prospects"
      >
        <ScraperPanel />
      </PageShell>
    </DashboardLayout>
  );
}

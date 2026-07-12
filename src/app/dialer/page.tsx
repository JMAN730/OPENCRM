import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { Dialer } from "@/features/calls/components/Dialer";
import { DIALER_ENABLED } from "@/lib/features";

interface Props {
  searchParams: Promise<{ leadId?: string; phone?: string }>;
}

export default async function DialerPage({ searchParams }: Props) {
  const { leadId, phone } = await searchParams;

  return (
    <DashboardLayout>
      {DIALER_ENABLED ? (
        <PageShell title="Dialer" subtitle="Make calls and view your call history.">
          <Dialer leadId={leadId} initialPhone={phone ? decodeURIComponent(phone) : undefined} />
        </PageShell>
      ) : (
        <PageShell title="Dialer" subtitle="Coming soon">
          <div className="crm-empty">
            The dialer is still being built and has been temporarily disabled.
            It will be back once it&apos;s finished.
          </div>
        </PageShell>
      )}
    </DashboardLayout>
  );
}

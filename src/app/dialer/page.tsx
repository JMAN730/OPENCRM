import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { Dialer } from "@/features/calls/components/Dialer";

interface Props {
  searchParams: Promise<{ leadId?: string; phone?: string }>;
}

export default async function DialerPage({ searchParams }: Props) {
  const { leadId, phone } = await searchParams;

  return (
    <DashboardLayout>
      <PageShell title="Dialer" subtitle="Make calls and view your call history.">
        <Dialer leadId={leadId} initialPhone={phone ? decodeURIComponent(phone) : undefined} />
      </PageShell>
    </DashboardLayout>
  );
}

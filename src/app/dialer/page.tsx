import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Dialer } from "@/features/calls/components/Dialer";

interface Props {
  searchParams: Promise<{ leadId?: string; phone?: string }>;
}

export default async function DialerPage({ searchParams }: Props) {
  const { leadId, phone } = await searchParams;

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Dialer</h1>
            <div className="crm-page-sub">Make calls and view your call history.</div>
          </div>
        </div>
        <Dialer leadId={leadId} initialPhone={phone ? decodeURIComponent(phone) : undefined} />
      </div>
    </DashboardLayout>
  );
}

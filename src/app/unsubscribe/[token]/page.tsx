import { prisma } from "@/lib/prisma";
import { EmailDraftStatus } from "@prisma/client";

const SENT_STATUSES: EmailDraftStatus[] = [
  EmailDraftStatus.SENT,
  EmailDraftStatus.OPENED,
  EmailDraftStatus.CLICKED,
];

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const draft = await prisma.emailDraft.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, leadId: true, organizationId: true, status: true, lead: { select: { email: true } } },
  });

  if (!draft || !draft.lead.email) {
    return (
      <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>This unsubscribe link is no longer valid.</p>
      </main>
    );
  }

  await prisma.emailOptOut.upsert({
    where: { email_organizationId: { email: draft.lead.email, organizationId: draft.organizationId } },
    create: { email: draft.lead.email, organizationId: draft.organizationId },
    update: {},
  });

  if (SENT_STATUSES.includes(draft.status)) {
    await prisma.emailDraft.update({
      where: { id: draft.id },
      data: { status: EmailDraftStatus.UNSUBSCRIBED },
    });
  }

  await prisma.emailEvent.create({
    data: { draftId: draft.id, event: "unsubscribed" },
  });

  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100dvh",
        fontFamily: "system-ui, sans-serif",
        background: "#f9fafb",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center", padding: "0 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: "#111827" }}>
          You&rsquo;ve been unsubscribed
        </h1>
        <p style={{ color: "#6b7280", lineHeight: 1.6 }}>
          {draft.lead.email} has been removed from our list. You won&rsquo;t receive further emails
          from this sender.
        </p>
      </div>
    </main>
  );
}

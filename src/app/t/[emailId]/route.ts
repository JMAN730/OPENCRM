import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EmailDraftStatus } from "@prisma/client";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ emailId: string }> },
) {
  // The path segment is the draft's unsubscribeToken (an unguessable nonce),
  // NOT the primary id — keying on the id would let anyone who can read the
  // outbound URL flip another org's draft to CLICKED and inject email events.
  const { emailId: token } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Throttle by IP so a guessing/abuse loop can't hammer the endpoint.
  const { ok } = await rateLimit({
    key: `email-track:${getClientIp(req.headers)}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const draft = await prisma.emailDraft.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, status: true, website: { select: { slug: true } } },
  });

  if (draft && (draft.status === EmailDraftStatus.SENT || draft.status === EmailDraftStatus.OPENED)) {
    prisma.emailDraft
      .update({ where: { id: draft.id }, data: { status: EmailDraftStatus.CLICKED } })
      .catch(() => undefined);
    prisma.emailEvent
      .create({ data: { draftId: draft.id, event: "clicked" } })
      .catch(() => undefined);
  }

  const slug = draft?.website?.slug;
  const destination = slug ? `${appUrl}/demo/${slug}` : appUrl || "/";
  return NextResponse.redirect(destination, 302);
}

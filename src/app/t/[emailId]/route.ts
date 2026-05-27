import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EmailDraftStatus } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const { emailId } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const draft = await prisma.emailDraft.findUnique({
    where: { id: emailId },
    select: { id: true, status: true, website: { select: { slug: true } } },
  });

  if (draft && (draft.status === EmailDraftStatus.SENT || draft.status === EmailDraftStatus.OPENED)) {
    prisma.emailDraft
      .update({ where: { id: emailId }, data: { status: EmailDraftStatus.CLICKED } })
      .catch(() => undefined);
    prisma.emailEvent
      .create({ data: { draftId: emailId, event: "clicked" } })
      .catch(() => undefined);
  }

  const slug = draft?.website?.slug;
  const destination = slug ? `${appUrl}/demo/${slug}` : appUrl || "/";
  return NextResponse.redirect(destination, 302);
}

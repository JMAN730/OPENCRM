export function trackedDemoUrl(draftId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/t/${draftId}`;
}

export function unsubscribeUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe/${token}`;
}

export function validateCanSpam(params: {
  subject: string;
  body: string;
  physicalAddress: string;
  unsubscribeUrl: string;
}): string[] {
  const errors: string[] = [];
  if (!params.subject.trim()) errors.push("Subject is required.");
  if (!params.body.includes(params.physicalAddress)) {
    errors.push("Email must include your physical mailing address.");
  }
  if (!params.body.includes(params.unsubscribeUrl)) {
    errors.push("Email must include the unsubscribe link.");
  }
  return errors;
}

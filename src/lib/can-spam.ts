/**
 * Resolves the public app base URL, failing closed when it isn't configured.
 * A missing base URL would otherwise yield `undefined/unsubscribe/...` links —
 * a broken unsubscribe link is a CAN-SPAM compliance failure, so we refuse to
 * build outbound links at all rather than send a non-compliant email.
 */
function appBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set — refusing to build tracking/unsubscribe links.",
    );
  }
  return url.replace(/\/$/, "");
}

// Keyed on a per-draft nonce (the draft's unsubscribeToken), never the primary
// id: the tracking URL travels in outbound email, so keying on a guessable cuid
// would let anyone flip another org's draft status and forge analytics events.
export function trackedDemoUrl(token: string): string {
  return `${appBaseUrl()}/t/${token}`;
}

export function unsubscribeUrl(token: string): string {
  return `${appBaseUrl()}/unsubscribe/${token}`;
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

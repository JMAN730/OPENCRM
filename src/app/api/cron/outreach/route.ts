import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { processOutreachQueue } from "@/features/outreach/server/worker";

const CRON_SECRET = process.env.CRON_SECRET;

// Constant-time comparison so the endpoint doesn't leak the secret via timing.
function safeMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!CRON_SECRET) {
    // Fail closed: if the secret is not configured, refuse all requests.
    // Set CRON_SECRET in your environment to enable this endpoint.
    return NextResponse.json(
      { error: "Cron endpoint is disabled: CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (!auth || !safeMatch(auth, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processOutreachQueue();
  return NextResponse.json({ ok: true, ...result });
}

import { NextResponse } from "next/server";
import { runDueSchedules } from "@/server/scraper/scheduler";

const CRON_SECRET = process.env.CRON_SECRET;

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
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueSchedules();
  return NextResponse.json({ ok: true, ...result });
}

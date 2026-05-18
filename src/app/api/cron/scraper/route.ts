import { NextResponse } from "next/server";
import { runDueSchedules } from "@/server/scraper/scheduler";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request): Promise<Response> {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runDueSchedules();
  return NextResponse.json({ ok: true, ...result });
}

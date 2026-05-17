import { prisma } from "@/lib/prisma";
import { parseStringArray } from "./utils";
import { startScraperJob } from "./runner";

export async function runDueSchedules(): Promise<{ triggered: number; skipped: number }> {
  const now = new Date();

  const due = await prisma.scheduledScrape.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: "asc" },
    take: 20,
  });

  let triggered = 0;
  let skipped = 0;

  for (const schedule of due) {
    const locations = parseStringArray(schedule.locations);
    const categories = parseStringArray(schedule.categories);

    if (locations.length === 0) {
      skipped++;
      continue;
    }

    // Use the org's first admin as the job initiator for scheduled runs.
    const admin = await prisma.user.findFirst({
      where: { organizationId: schedule.organizationId, role: "ADMIN" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!admin) {
      skipped++;
      continue;
    }

    try {
      const job = await prisma.scraperJob.create({
        data: {
          organizationId: schedule.organizationId,
          userId: admin.id,
          locations,
          categories,
          limit: schedule.limit,
          concurrency: schedule.concurrency,
          autoImport: schedule.autoImport,
          status: "PENDING",
        },
      });

      await startScraperJob(job.id);

      const nextRunAt = nextRunDate(schedule.dayOfWeek, schedule.hourOfDay);
      await prisma.scheduledScrape.update({
        where: { id: schedule.id },
        data: { lastRunAt: now, nextRunAt },
      });

      triggered++;
    } catch {
      await prisma.scheduledScrape.update({
        where: { id: schedule.id },
        data: { nextRunAt: nextRunDate(schedule.dayOfWeek, schedule.hourOfDay) },
      });
      skipped++;
    }
  }

  return { triggered, skipped };
}

function nextRunDate(dayOfWeek: number, hourOfDay: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hourOfDay, 0, 0, 0);
  const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7;
  next.setUTCDate(now.getUTCDate() + (daysUntil === 0 && next <= now ? 7 : daysUntil));
  return next;
}

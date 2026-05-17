/**
 * One-shot backfill: populate organizationId on legacy Note and Activity rows
 * by copying it from the parent Lead. Safe to re-run — only touches rows that
 * still have NULL organizationId.
 *
 * Run with: npx tsx scripts/backfill-org-id.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  const noteResult = await prisma.$executeRaw`
    UPDATE "Note" n
    SET "organizationId" = l."organizationId"
    FROM "Lead" l
    WHERE n."leadId" = l.id
      AND n."organizationId" IS NULL
  `;
  console.log(`Backfilled Note.organizationId on ${noteResult} rows.`);

  const activityResult = await prisma.$executeRaw`
    UPDATE "Activity" a
    SET "organizationId" = l."organizationId"
    FROM "Lead" l
    WHERE a."leadId" = l.id
      AND a."organizationId" IS NULL
  `;
  console.log(`Backfilled Activity.organizationId on ${activityResult} rows.`);

  const remainingNotes = await prisma.note.count({
    where: { organizationId: null },
  });
  const remainingActivities = await prisma.activity.count({
    where: { organizationId: null },
  });

  if (remainingNotes > 0 || remainingActivities > 0) {
    console.warn(
      `WARNING: ${remainingNotes} notes and ${remainingActivities} activities still have NULL organizationId. ` +
      `Their parent leads were likely deleted — these rows are dangling and should be removed manually.`,
    );
  } else {
    console.log("All Note and Activity rows have organizationId set.");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

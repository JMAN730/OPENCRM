import { prisma } from "@/lib/prisma";
import { TRIAL_DAYS } from "@/features/billing/server/plans";

async function main() {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });

  let created = 0;
  for (const org of orgs) {
    const existing = await prisma.organizationSubscription.findUnique({
      where: { organizationId: org.id },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.organizationSubscription.create({
      data: {
        organizationId: org.id,
        status: "TRIALING",
        planTier: "STARTER",
        seatLimit: 3,
        trialEndsAt,
      },
    });
    created += 1;
  }

  console.log(`Backfilled ${created} organization subscription(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

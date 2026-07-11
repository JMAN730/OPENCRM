/**
 * Grant (or revoke) the platform "master account" flag for a user.
 *
 * The super-admin flag is never settable through the app UI — it is deliberately
 * an out-of-band operation so that no in-app privilege escalation can reach it.
 *
 *   npx tsx scripts/grant-superadmin.ts <email>            # grant
 *   npx tsx scripts/grant-superadmin.ts <email> --revoke   # revoke
 *
 * Bumping sessionVersion forces the user's existing JWTs to re-hydrate on their
 * next request, so the new flag takes effect without a manual re-login.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Usage: npx tsx scripts/grant-superadmin.ts <email> [--revoke]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, sessionVersion: true, isSuperAdmin: true },
  });

  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isSuperAdmin: !revoke,
      // Invalidate outstanding sessions so the change propagates immediately.
      sessionVersion: { increment: 1 },
    },
    select: { email: true, isSuperAdmin: true },
  });

  console.log(
    `${updated.isSuperAdmin ? "Granted" : "Revoked"} platform admin for ${updated.email}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

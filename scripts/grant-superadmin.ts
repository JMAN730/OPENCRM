/**
 * Grant (or revoke) the platform "master account" flag for a user.
 *
 * The super-admin flag is never settable through the app UI — it is deliberately
 * an out-of-band operation so that no in-app privilege escalation can reach it.
 *
 *   npx tsx scripts/grant-superadmin.ts <email>            # grant
 *   npx tsx scripts/grant-superadmin.ts <email> --revoke   # revoke
 *
 * Invalidating the cached auth snapshot forces the user's existing JWTs to
 * re-hydrate from the DB on their next session refresh, so the new flag takes
 * effect without a manual re-login. (We deliberately do NOT bump sessionVersion
 * here: that counter is the credential-revocation signal, and bumping it would
 * make the jwt callback treat the change as a revoked session and log the user
 * out — this is a role-like permission change, not a credential change.)
 */
import { prisma } from "@/lib/prisma";
import { invalidateAuthSnapshot } from "@/lib/auth";

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Usage: npx tsx scripts/grant-superadmin.ts <email> [--revoke]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isSuperAdmin: true },
  });

  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isSuperAdmin: !revoke },
    select: { email: true, isSuperAdmin: true },
  });

  // Bust the cached auth snapshot so the next session refresh re-reads the flag
  // from the DB (within the 60s TTL even if Redis is down and this no-ops).
  await invalidateAuthSnapshot(user.id);

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

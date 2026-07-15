/**
 * True when a Prisma error is a unique-constraint violation (code P2002).
 * Duck-typed on `code` rather than `instanceof` so it works regardless of
 * which Prisma client/adapter constructed the error.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

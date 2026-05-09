import { describe, it, expect } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("authRouter.resetPassword", () => {
  it("always returns success without revealing whether the email exists", async () => {
    const { caller, prisma } = createTestCaller({ session: null });

    // Should NOT touch the database — never queries the user table
    const result = await caller.auth.resetPassword({ email: "anyone@example.com" });

    expect(result).toEqual({ success: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects malformed emails (zod validation)", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(caller.auth.resetPassword({ email: "not-an-email" })).rejects.toThrow();
  });

  it("works without an authenticated session (publicProcedure)", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(caller.auth.resetPassword({ email: "x@y.com" })).resolves.toEqual({
      success: true,
    });
  });
});

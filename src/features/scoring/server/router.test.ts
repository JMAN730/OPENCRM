import { beforeEach, describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("scoringRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
    // Run interactive (callback-form) transactions against the same mock
    // prisma so we can configure and assert on the calls getRules makes
    // inside its seed path. The default helper hands the callback a fresh
    // mock, which we can't pre-configure.
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prisma);
      return undefined;
    });
  });

  describe("getRules", () => {
    it("returns existing rules without seeding or opening a transaction", async () => {
      const rules = [{ id: "r1", factor: "star_rating", organizationId: "org-1" }];
      prisma.scoringRule.findMany.mockResolvedValue(rules);

      const result = await caller.scoring.getRules();

      expect(result).toEqual(rules);
      expect(prisma.scoringRule.createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("seeds the default rules under an advisory lock on first access", async () => {
      prisma.scoringRule.findMany
        .mockResolvedValueOnce([]) // initial existence check
        .mockResolvedValueOnce([]) // in-transaction recheck (still empty)
        .mockResolvedValueOnce([{ id: "r1" }]); // final read after seeding
      prisma.scoringRule.createMany.mockResolvedValue({ count: 6 });

      const result = await caller.scoring.getRules();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Advisory lock acquired before any insert.
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.scoringRule.createMany).toHaveBeenCalledTimes(1);

      const seedData = prisma.scoringRule.createMany.mock.calls[0][0].data;
      expect(seedData).toHaveLength(6);
      expect(
        seedData.every((r: { organizationId: string }) => r.organizationId === "org-1"),
      ).toBe(true);
      expect(result).toEqual([{ id: "r1" }]);
    });

    it("does not double-seed when a concurrent request already seeded (in-tx recheck)", async () => {
      const seeded = [{ id: "r1" }, { id: "r2" }];
      prisma.scoringRule.findMany
        .mockResolvedValueOnce([]) // initial check: empty, so we enter the tx
        .mockResolvedValueOnce(seeded); // recheck inside the lock: already seeded

      const result = await caller.scoring.getRules();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.scoringRule.createMany).not.toHaveBeenCalled();
      expect(result).toEqual(seeded);
    });
  });
});

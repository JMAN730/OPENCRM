import { beforeEach, describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

const RULE_STUB = {
  id: "rule-1",
  organizationId: "org-1",
  factor: "star_rating",
  label: "Star Rating",
  maxPoints: 40,
  weight: 1.0,
  isActive: true,
  sortOrder: 0,
  config: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

  describe("upsertRule — create path", () => {
    it("creates a new rule when no id is provided", async () => {
      prisma.scoringRule.count.mockResolvedValue(3);
      prisma.scoringRule.create.mockResolvedValue({ ...RULE_STUB, id: "rule-new" });

      const result = await caller.scoring.upsertRule({
        factor: "star_rating",
        label: "Star Rating",
        maxPoints: 40,
        weight: 1.0,
      });
      expect(prisma.scoringRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ factor: "star_rating", sortOrder: 3 }),
        }),
      );
      expect(result.id).toBe("rule-new");
    });

    it("uses provided sortOrder over count when given", async () => {
      prisma.scoringRule.count.mockResolvedValue(5);
      prisma.scoringRule.create.mockResolvedValue({ ...RULE_STUB, sortOrder: 99 });

      await caller.scoring.upsertRule({
        factor: "review_count",
        label: "Review Count",
        maxPoints: 25,
        weight: 1.0,
        sortOrder: 99,
      });
      expect(prisma.scoringRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 99 }),
        }),
      );
    });
  });

  describe("upsertRule — update path", () => {
    it("updates a rule when an id is provided", async () => {
      prisma.scoringRule.findFirst.mockResolvedValue({ id: "rule-1" });
      prisma.scoringRule.update.mockResolvedValue({ ...RULE_STUB, weight: 1.5 });

      const result = await caller.scoring.upsertRule({
        id: "rule-1",
        factor: "star_rating",
        label: "Star Rating",
        maxPoints: 40,
        weight: 1.5,
      });
      expect(prisma.scoringRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "rule-1" } }),
      );
      expect(result.weight).toBe(1.5);
    });

    it("throws NOT_FOUND when rule id is outside org scope", async () => {
      prisma.scoringRule.findFirst.mockResolvedValue(null);

      await expect(
        caller.scoring.upsertRule({
          id: "rule-other",
          factor: "star_rating",
          label: "Star Rating",
          maxPoints: 40,
          weight: 1.0,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("serialises config record to JSON", async () => {
      prisma.scoringRule.findFirst.mockResolvedValue({ id: "rule-1" });
      prisma.scoringRule.update.mockResolvedValue(RULE_STUB);

      await caller.scoring.upsertRule({
        id: "rule-1",
        factor: "call_activity",
        label: "Call Activity",
        maxPoints: 25,
        weight: 1.0,
        config: { ANSWERED: 25, HUNG_UP: -10 },
      });
      expect(prisma.scoringRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ config: { ANSWERED: 25, HUNG_UP: -10 } }),
        }),
      );
    });
  });

  describe("deleteRule", () => {
    it("deletes a rule that belongs to the org", async () => {
      prisma.scoringRule.findFirst.mockResolvedValue({ id: "rule-1" });
      prisma.scoringRule.delete.mockResolvedValue(RULE_STUB);

      const result = await caller.scoring.deleteRule({ id: "rule-1" });
      expect(prisma.scoringRule.delete).toHaveBeenCalledWith({ where: { id: "rule-1" } });
      expect(result).toMatchObject({ id: "rule-1" });
    });

    it("throws NOT_FOUND for rules outside the org", async () => {
      prisma.scoringRule.findFirst.mockResolvedValue(null);
      await expect(caller.scoring.deleteRule({ id: "other" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("resetToDefaults", () => {
    it("deletes all org rules then re-seeds defaults", async () => {
      prisma.scoringRule.deleteMany.mockResolvedValue({ count: 4 });
      prisma.scoringRule.createMany.mockResolvedValue({ count: 6 });
      prisma.scoringRule.findMany.mockResolvedValue([RULE_STUB]);

      const result = await caller.scoring.resetToDefaults();
      expect(prisma.scoringRule.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
      });
      expect(prisma.scoringRule.createMany).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
    });
  });

  describe("role gating", () => {
    it("blocks USER from calling upsertRule", async () => {
      const { caller } = createTestCaller({ sessionOverrides: { role: "USER" } });

      await expect(
        caller.scoring.upsertRule({
          factor: "star_rating",
          label: "Star Rating",
          maxPoints: 40,
          weight: 1.0,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("blocks USER from calling deleteRule", async () => {
      const { caller } = createTestCaller({ sessionOverrides: { role: "USER" } });

      await expect(
        caller.scoring.deleteRule({ id: "rule-1" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("blocks USER from calling resetToDefaults", async () => {
      const { caller } = createTestCaller({ sessionOverrides: { role: "USER" } });

      await expect(caller.scoring.resetToDefaults()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("allows MANAGER to call upsertRule", async () => {
      const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "MANAGER" } });
      prisma.scoringRule.findFirst.mockResolvedValue(null);
      prisma.scoringRule.create.mockResolvedValue({ ...RULE_STUB });

      await caller.scoring.upsertRule({
        factor: "star_rating",
        label: "Star Rating",
        maxPoints: 40,
        weight: 1.0,
      });

      expect(prisma.scoringRule.create).toHaveBeenCalled();
    });
  });
});

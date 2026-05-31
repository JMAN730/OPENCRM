import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";
import type { MockPrisma } from "@/test/trpc";

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
  let prisma: MockPrisma;

  beforeEach(() => {
    const result = createTestCaller();
    caller = result.caller;
    prisma = result.prisma;
  });

  describe("getRules", () => {
    it("returns existing rules when present", async () => {
      prisma.scoringRule.findMany.mockResolvedValue([RULE_STUB]);

      const result = await caller.scoring.getRules();
      expect(result).toHaveLength(1);
      expect(result[0].factor).toBe("star_rating");
      // Should not seed defaults when rows already exist
      expect(prisma.scoringRule.createMany).not.toHaveBeenCalled();
    });

    it("seeds default rules and returns them on first access", async () => {
      // First findMany (check for existing) → empty; second (after seed) → defaults
      prisma.scoringRule.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([RULE_STUB]);

      const result = await caller.scoring.getRules();
      expect(prisma.scoringRule.createMany).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
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

import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";
import type { MockPrisma } from "@/test/trpc";

const SCRIPT_STUB = {
  id: "script-1",
  organizationId: "org-1",
  category: "Opening",
  title: "Cold Call Opener",
  body: "Hi [Prospect Name]...",
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("scriptsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: MockPrisma;

  beforeEach(() => {
    const result = createTestCaller();
    caller = result.caller;
    prisma = result.prisma;
  });

  describe("getAll", () => {
    it("returns existing scripts when present", async () => {
      prisma.salesScript.findMany.mockResolvedValue([SCRIPT_STUB]);

      const result = await caller.scripts.getAll();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Cold Call Opener");
      expect(prisma.salesScript.createMany).not.toHaveBeenCalled();
    });

    it("seeds defaults and returns them on first access", async () => {
      prisma.salesScript.findMany
        .mockResolvedValueOnce([])          // first call: empty → trigger seed
        .mockResolvedValue([SCRIPT_STUB]);  // second call: after seed

      const result = await caller.scripts.getAll();
      expect(prisma.salesScript.createMany).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
    });
  });

  describe("replaceAll", () => {
    it("replaces scripts atomically via $transaction", async () => {
      prisma.salesScript.deleteMany.mockResolvedValue({ count: 2 });
      prisma.salesScript.createMany.mockResolvedValue({ count: 3 });

      await caller.scripts.replaceAll({
        scripts: [
          { category: "Opening", title: "My Opener", body: "Hello!", order: 0 },
          { category: "Closing", title: "My Close", body: "Deal?", order: 1 },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it("throws FORBIDDEN when caller is a regular USER", async () => {
      const { caller: userCaller } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });

      await expect(
        userCaller.scripts.replaceAll({
          scripts: [{ category: "Opening", title: "T", body: "B", order: 0 }],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects oversized script arrays with BAD_REQUEST", async () => {
      const tooMany = Array.from({ length: 501 }, (_, i) => ({
        category: "Opening",
        title: `T${i}`,
        body: "B",
        order: i,
      }));

      await expect(
        caller.scripts.replaceAll({ scripts: tooMany }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

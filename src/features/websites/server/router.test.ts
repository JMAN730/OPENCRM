import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/test/trpc";
import type { MockPrisma } from "@/test/trpc";

describe("websitesRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: MockPrisma;
  const originalDeepseekKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    const result = createTestCaller();
    caller = result.caller;
    prisma = result.prisma;
  });

  afterEach(() => {
    if (originalDeepseekKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
    }
  });

  describe("getForLead", () => {
    it("returns the most recent generated website for the lead", async () => {
      const website = { id: "w-1", leadId: "lead-1", template: "my_template", title: "Acme", content: {} };
      prisma.generatedWebsite.findFirst.mockResolvedValue(website);

      const result = await caller.websites.getForLead({ leadId: "lead-1" });
      expect(result).toEqual(website);
      expect(prisma.generatedWebsite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { leadId: "lead-1", lead: { organizationId: "org-1" } },
        }),
      );
    });

    it("returns null when no website exists", async () => {
      prisma.generatedWebsite.findFirst.mockResolvedValue(null);
      const result = await caller.websites.getForLead({ leadId: "lead-1" });
      expect(result).toBeNull();
    });

    it("uses assigned-lead visibility for non-admin callers", async () => {
      const { caller: userCaller, prisma: userPrisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      userPrisma.generatedWebsite.findFirst.mockResolvedValue(null);

      await userCaller.websites.getForLead({ leadId: "lead-1" });

      expect(userPrisma.generatedWebsite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            leadId: "lead-1",
            lead: {
              organizationId: "org-1",
              assignedToId: { in: ["user-1"] },
            },
          },
        }),
      );
    });
  });

  describe("generateAi", () => {
    it("creates an AI demo with fallback content when DeepSeek is not configured", async () => {
      delete process.env.DEEPSEEK_API_KEY;

      const lead = {
        id: "lead-1",
        organizationId: "org-1",
        company: "Acme Landscaping",
        firstName: "John",
        lastName: "Doe",
        phone: "555-1234",
        email: "john@acme.com",
        city: "Tampa",
        rating: 4.8,
        reviewCount: 42,
        source: "GoogleMaps / Landscaping / Tampa, FL",
        category: "Landscaping",
        website: "https://acme.example",
        qualificationSummary: null,
      };
      prisma.lead.findFirst.mockResolvedValue(lead);
      prisma.generatedWebsite.findUnique.mockResolvedValue(null);
      prisma.generatedWebsite.findFirst.mockResolvedValue(null);
      prisma.generatedWebsite.create.mockImplementation((args) =>
        Promise.resolve({ id: "w-ai", ...args.data }),
      );

      const result = await caller.websites.generateAi({ leadId: "lead-1" });

      expect(prisma.generatedWebsite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: "lead-1",
            template: "ai_demo",
            slug: "acme-landscaping-tampa",
            content: expect.objectContaining({
              headline: "Acme Landscaping in Tampa",
              cta: "Call now",
            }),
          }),
        }),
      );
      expect(result).toMatchObject({ id: "w-ai", template: "ai_demo" });
    });
  });

  describe("delete", () => {
    it("deletes an org-scoped website", async () => {
      prisma.generatedWebsite.findFirst.mockResolvedValue({ id: "w-1" });
      prisma.generatedWebsite.delete.mockResolvedValue({ id: "w-1" });

      const result = await caller.websites.delete({ id: "w-1" });
      expect(prisma.generatedWebsite.delete).toHaveBeenCalledWith({ where: { id: "w-1" } });
      expect(result).toMatchObject({ id: "w-1" });
    });

    it("throws NOT_FOUND when website is outside org scope", async () => {
      prisma.generatedWebsite.findFirst.mockResolvedValue(null);
      await expect(caller.websites.delete({ id: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

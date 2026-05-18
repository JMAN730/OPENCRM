import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";
import type { MockPrisma } from "@/test/trpc";

describe("websitesRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: MockPrisma;

  beforeEach(() => {
    const result = createTestCaller();
    caller = result.caller;
    prisma = result.prisma;
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
  });

  describe("generate", () => {
    const baseLead = {
      id: "lead-1",
      company: "Acme Landscaping",
      firstName: "John",
      lastName: "Doe",
      phone: "555-1234",
      email: "john@acme.com",
      city: "Tampa",
      rating: 4.8,
      reviewCount: 42,
      notes: [],
    };

    it("creates a new website when none exists", async () => {
      prisma.lead.findFirst.mockResolvedValue(baseLead);
      prisma.generatedWebsite.findFirst.mockResolvedValue(null);
      const created = { id: "w-new", leadId: "lead-1", template: "my_template", title: expect.any(String), content: expect.any(Object) };
      prisma.generatedWebsite.create.mockResolvedValue(created);

      const result = await caller.websites.generate({ leadId: "lead-1", template: "my_template" });
      expect(prisma.generatedWebsite.create).toHaveBeenCalled();
      expect(result).toMatchObject({ leadId: "lead-1" });
    });

    it("updates an existing website when one exists", async () => {
      prisma.lead.findFirst.mockResolvedValue(baseLead);
      prisma.generatedWebsite.findFirst.mockResolvedValue({ id: "w-1", leadId: "lead-1" });
      const updated = { id: "w-1", leadId: "lead-1", template: "my_template" };
      prisma.generatedWebsite.update.mockResolvedValue(updated);

      const result = await caller.websites.generate({ leadId: "lead-1", template: "my_template" });
      expect(prisma.generatedWebsite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "w-1" } }),
      );
      expect(result).toMatchObject({ id: "w-1" });
    });

    it("throws NOT_FOUND when the lead doesn't belong to the org", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        caller.websites.generate({ leadId: "other-lead", template: "my_template" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("fills in lead details in generated content", async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...baseLead, notes: [{ content: "Great business!" }] });
      prisma.generatedWebsite.findFirst.mockResolvedValue(null);
      prisma.generatedWebsite.create.mockImplementation((args) =>
        Promise.resolve({ id: "w-1", ...args.data }),
      );

      const result = await caller.websites.generate({ leadId: "lead-1", template: "my_template" });
      expect(result.title).toContain("Acme Landscaping");
    });
  });

  describe("update", () => {
    const updateInput = {
      id: "w-1",
      content: {
        hero: { title: "Updated", tagline: "Tagline", cta: "CTA" },
        about: { heading: "About", body: "Body text" },
        services: [{ title: "Service", description: "Desc" }],
        contact: { phone: "555", email: "e@e.com", address: "Tampa" },
        footer: { tagline: "Footer" },
      },
    };

    it("updates the website content", async () => {
      prisma.generatedWebsite.findFirst.mockResolvedValue({ id: "w-1" });
      prisma.generatedWebsite.update.mockResolvedValue({ ...updateInput, id: "w-1" });

      const result = await caller.websites.update(updateInput);
      expect(prisma.generatedWebsite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "w-1" } }),
      );
      expect(result).toMatchObject({ id: "w-1" });
    });

    it("throws NOT_FOUND when website is outside org scope", async () => {
      prisma.generatedWebsite.findFirst.mockResolvedValue(null);
      await expect(caller.websites.update(updateInput)).rejects.toMatchObject({ code: "NOT_FOUND" });
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

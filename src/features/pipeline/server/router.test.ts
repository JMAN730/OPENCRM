import { beforeEach, describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("pipelineRouter.createDeal", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-1",
      name: "Proposal",
      pipeline: { organizationId: "org-1" },
    });
  });

  describe("existing-lead branch", () => {
    it("moves a visible lead to the chosen stage and updates value when provided", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", company: "Acme", pipelineStageId: "stage-1" });

      const result = await caller.pipeline.createDeal({
        leadId: "lead-1",
        stageId: "stage-1",
        value: 5000,
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { pipelineStageId: "stage-1", value: 5000 },
      });
      expect(prisma.lead.create).not.toHaveBeenCalled();
      expect(prisma.activity.create).toHaveBeenCalled();
      expect(result.id).toBe("lead-1");
    });

    it("does not touch the value when none is provided", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", company: "Acme" });

      await caller.pipeline.createDeal({ leadId: "lead-1", stageId: "stage-1" });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { pipelineStageId: "stage-1" },
      });
    });

    it("rejects with FORBIDDEN when the lead is not visible to the caller", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        caller.pipeline.createDeal({ leadId: "lead-other-org", stageId: "stage-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it("rejects with FORBIDDEN when the stage belongs to another organization", async () => {
      prisma.pipelineStage.findFirst.mockResolvedValue({
        id: "stage-x",
        name: "Proposal",
        pipeline: { organizationId: "other-org" },
      });

      await expect(
        caller.pipeline.createDeal({ leadId: "lead-1", stageId: "stage-x" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.lead.update).not.toHaveBeenCalled();
    });
  });

  describe("new-lead branch", () => {
    it("creates a fresh lead with the supplied company and value", async () => {
      prisma.lead.create.mockResolvedValue({ id: "lead-new", company: "Acme Inc.", pipelineStageId: "stage-1" });

      const result = await caller.pipeline.createDeal({
        company: "Acme Inc.",
        value: 1200,
        stageId: "stage-1",
      });

      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: {
          company: "Acme Inc.",
          value: 1200,
          organizationId: "org-1",
          assignedToId: "user-1",
          pipelineStageId: "stage-1",
        },
      });
      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(result.id).toBe("lead-new");
    });

    it("rejects an empty company name", async () => {
      await expect(
        caller.pipeline.createDeal({ company: "   ", stageId: null }),
      ).rejects.toBeDefined();

      expect(prisma.lead.create).not.toHaveBeenCalled();
    });
  });
});

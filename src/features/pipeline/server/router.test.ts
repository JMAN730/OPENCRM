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

describe("pipelineRouter.renameStage", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("renames a stage owned by the caller's organization", async () => {
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-1",
      name: "Proposal",
      pipeline: { organizationId: "org-1" },
    });
    prisma.pipelineStage.update.mockResolvedValue({ id: "stage-1", name: "Pitching" });

    const result = await caller.pipeline.renameStage({ stageId: "stage-1", name: "Pitching" });

    expect(prisma.pipelineStage.update).toHaveBeenCalledWith({
      where: { id: "stage-1" },
      data: { name: "Pitching" },
    });
    expect(result.name).toBe("Pitching");
  });

  it("rejects with FORBIDDEN for a stage from another organization", async () => {
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-x",
      name: "Proposal",
      pipeline: { organizationId: "other-org" },
    });

    await expect(
      caller.pipeline.renameStage({ stageId: "stage-x", name: "Hi" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.pipelineStage.update).not.toHaveBeenCalled();
  });
});

describe("pipelineRouter.deleteStage", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("deletes an empty non-default stage", async () => {
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-custom",
      name: "Discovery",
      pipeline: { organizationId: "org-1" },
      _count: { leads: 0 },
    });
    prisma.pipelineStage.delete.mockResolvedValue({ id: "stage-custom" });

    await caller.pipeline.deleteStage({ stageId: "stage-custom" });

    expect(prisma.pipelineStage.delete).toHaveBeenCalledWith({ where: { id: "stage-custom" } });
  });

  it("refuses to delete a default stage", async () => {
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-potential",
      name: "Potential",
      pipeline: { organizationId: "org-1" },
      _count: { leads: 0 },
    });

    await expect(
      caller.pipeline.deleteStage({ stageId: "stage-potential" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.pipelineStage.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a stage that still has deals", async () => {
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-custom",
      name: "Discovery",
      pipeline: { organizationId: "org-1" },
      _count: { leads: 3 },
    });

    await expect(
      caller.pipeline.deleteStage({ stageId: "stage-custom" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.pipelineStage.delete).not.toHaveBeenCalled();
  });
});

describe("pipelineRouter.duplicateStage", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
    // Run the transaction callback against the same mock prisma so the
    // assertions below can observe the calls.
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)(prisma);
      }
      if (Array.isArray(arg)) return Promise.all(arg);
      return undefined;
    });
  });

  it("creates a copy and shifts later stages down by 1", async () => {
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-2",
      name: "Qualified",
      order: 1,
      pipelineId: "pipe-1",
      pipeline: { organizationId: "org-1" },
    });
    prisma.pipelineStage.updateMany.mockResolvedValue({ count: 4 });
    prisma.pipelineStage.create.mockResolvedValue({
      id: "stage-new",
      name: "Qualified (Copy)",
      order: 2,
      pipelineId: "pipe-1",
    });

    const result = await caller.pipeline.duplicateStage({ stageId: "stage-2" });

    expect(prisma.pipelineStage.updateMany).toHaveBeenCalledWith({
      where: { pipelineId: "pipe-1", order: { gt: 1 } },
      data: { order: { increment: 1 } },
    });
    expect(prisma.pipelineStage.create).toHaveBeenCalledWith({
      data: { name: "Qualified (Copy)", order: 2, pipelineId: "pipe-1" },
    });
    expect(result.id).toBe("stage-new");
  });
});

describe("pipelineRouter.updateDealValue", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("updates the value on an existing lead", async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
    prisma.lead.update.mockResolvedValue({ id: "lead-1", value: 5000 });

    const result = await caller.pipeline.updateDealValue({ leadId: "lead-1", value: 5000 });

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lead-1" }, data: { value: 5000 } }),
    );
    expect(result).toMatchObject({ id: "lead-1" });
  });

  it("allows clearing the value with null", async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
    prisma.lead.update.mockResolvedValue({ id: "lead-1", value: null });

    await caller.pipeline.updateDealValue({ leadId: "lead-1", value: null });

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { value: null } }),
    );
  });

  it("throws NOT_FOUND when the lead is not in the org", async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(caller.pipeline.updateDealValue({ leadId: "other-lead", value: 100 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/features/websites/server/service", () => ({
  generateWebsiteForLead: vi.fn(),
}));
vi.mock("@/features/emails/server/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../../emails/server/service")>()),
  generateDraftForLead: vi.fn(),
}));
vi.mock("@/features/sms/server/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../../sms/server/service")>()),
  generateSmsDraftForLead: vi.fn(),
}));
vi.mock("@/features/sms/server/twilio", () => ({
  isSmsConfigured: vi.fn(),
}));

import { processOutreachQueue } from "./worker";
import { generateWebsiteForLead } from "@/features/websites/server/service";
import { generateDraftForLead } from "@/features/emails/server/service";
import { generateSmsDraftForLead } from "@/features/sms/server/service";
import { isSmsConfigured } from "@/features/sms/server/twilio";

function createMockPrisma() {
  return {
    outreachJob: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    lead: {
      findUnique: vi.fn(),
    },
    emailOptOut: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    emailDraft: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    phoneOptOut: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    smsDraft: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

const baseJob = {
  id: "oj-1",
  leadId: "lead-1",
  organizationId: "org-1",
  createdById: "user-1",
  status: "PROCESSING",
  attempts: 1,
};

const baseLead = {
  id: "lead-1",
  organizationId: "org-1",
  email: "owner@acme.com",
  phone: "+1 (555) 234-5678",
  company: "Acme",
};

function run(prisma: MockPrisma, opts?: { batchSize?: number; timeBudgetMs?: number }) {
  return processOutreachQueue({
    prisma: prisma as never,
    batchSize: opts?.batchSize ?? 5,
    timeBudgetMs: opts?.timeBudgetMs ?? 55_000,
  });
}

describe("processOutreachQueue", () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
    vi.mocked(generateWebsiteForLead).mockResolvedValue({
      website: { id: "web-1", slug: "acme-demo" },
      needsPhotos: false,
    } as never);
    vi.mocked(generateDraftForLead).mockResolvedValue({ draftId: "draft-1" });
    vi.mocked(generateSmsDraftForLead).mockResolvedValue({ draftId: "sms-1" });
    vi.mocked(isSmsConfigured).mockReturnValue(true);
  });

  it("returns zero counters when the queue is empty", async () => {
    const result = await run(prisma);
    expect(result).toEqual({ processed: 0, done: 0, skipped: 0, failed: 0, retried: 0 });
  });

  it("reconciles stale PROCESSING rows back to PENDING", async () => {
    await run(prisma);
    expect(prisma.outreachJob.updateMany).toHaveBeenCalledWith({
      where: { status: "PROCESSING", updatedAt: { lt: expect.any(Date) } },
      data: { status: "PENDING" },
    });
  });

  it("prefers an SMS draft for a lead with a phone number", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue(baseLead);

    const result = await run(prisma);

    expect(generateWebsiteForLead).toHaveBeenCalledWith(prisma, baseLead, {
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(generateSmsDraftForLead).toHaveBeenCalledWith(prisma, baseLead, {
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(generateDraftForLead).not.toHaveBeenCalled();
    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({
        status: "DONE",
        websiteId: "web-1",
        smsDraftId: "sms-1",
        draftId: null,
      }),
    });
    expect(result).toMatchObject({ processed: 1, done: 1 });
  });

  it("falls back to email for a lead without a phone number", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue({ ...baseLead, phone: null });

    await run(prisma);

    expect(generateDraftForLead).toHaveBeenCalledTimes(1);
    expect(generateSmsDraftForLead).not.toHaveBeenCalled();
    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ draftId: "draft-1", smsDraftId: null }),
    });
  });

  it("falls back to email when SMS is not configured", async () => {
    vi.mocked(isSmsConfigured).mockReturnValue(false);
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue(baseLead);

    await run(prisma);

    expect(generateDraftForLead).toHaveBeenCalledTimes(1);
    expect(generateSmsDraftForLead).not.toHaveBeenCalled();
  });

  it("skips an item another worker already claimed (atomic claim)", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    // Reconcile call succeeds; the claim call loses the race.
    prisma.outreachJob.updateMany.mockImplementation(async (args: { where: { status: string } }) =>
      args.where.status === "PENDING" && "id" in args.where ? { count: 0 } : { count: 0 },
    );

    const result = await run(prisma);

    expect(result.processed).toBe(0);
    expect(generateWebsiteForLead).not.toHaveBeenCalled();
  });

  it.each([
    ["lead_deleted", { lead: null }],
    ["no_contact", { lead: { ...baseLead, email: null, phone: null } }],
  ])("marks the job SKIPPED with reason %s", async (reason, { lead }) => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue(lead);

    const result = await run(prisma);

    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ status: "SKIPPED", skipReason: reason }),
    });
    expect(result).toMatchObject({ processed: 1, skipped: 1, done: 0 });
    expect(generateWebsiteForLead).not.toHaveBeenCalled();
  });

  it("skips a phone number that opted out", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue(baseLead);
    prisma.phoneOptOut.findUnique.mockResolvedValue({ id: "phone-opt-1" });

    const result = await run(prisma);

    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ status: "SKIPPED", skipReason: "phone_opted_out" }),
    });
    expect(result).toMatchObject({ skipped: 1 });
    expect(generateWebsiteForLead).not.toHaveBeenCalled();
  });

  it("skips a lead that belongs to a different org than the job", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue({ ...baseLead, organizationId: "org-other" });

    const result = await run(prisma);

    expect(result).toMatchObject({ skipped: 1, done: 0 });
    expect(generateWebsiteForLead).not.toHaveBeenCalled();
  });

  it("marks the job SKIPPED when the email has opted out", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue({ ...baseLead, phone: null });
    prisma.emailOptOut.findUnique.mockResolvedValue({ id: "opt-1" });

    const result = await run(prisma);

    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ status: "SKIPPED", skipReason: "opted_out" }),
    });
    expect(result).toMatchObject({ skipped: 1 });
  });

  it("marks the job SKIPPED when a draft already exists for the lead", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue(baseJob);
    prisma.lead.findUnique.mockResolvedValue({ ...baseLead, phone: null });
    prisma.emailDraft.findFirst.mockResolvedValue({ id: "draft-existing" });

    const result = await run(prisma);

    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ status: "SKIPPED", skipReason: "draft_exists" }),
    });
    expect(result).toMatchObject({ skipped: 1 });
    expect(generateWebsiteForLead).not.toHaveBeenCalled();
  });

  it("returns a failed item to PENDING for retry while attempts remain", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue({ ...baseJob, attempts: 1 });
    prisma.lead.findUnique.mockResolvedValue({ ...baseLead, phone: null });
    vi.mocked(generateWebsiteForLead).mockRejectedValue(new Error("deepseek 429"));

    const result = await run(prisma);

    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ status: "PENDING", error: "deepseek 429" }),
    });
    expect(result).toMatchObject({ retried: 1, failed: 0 });
  });

  it("marks the job FAILED once max attempts are exhausted", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }]);
    prisma.outreachJob.findUnique.mockResolvedValue({ ...baseJob, attempts: 3 });
    prisma.lead.findUnique.mockResolvedValue({ ...baseLead, phone: null });
    vi.mocked(generateDraftForLead).mockRejectedValue(new Error("no api key"));

    const result = await run(prisma);

    expect(prisma.outreachJob.update).toHaveBeenCalledWith({
      where: { id: "oj-1" },
      data: expect.objectContaining({ status: "FAILED", error: "no api key" }),
    });
    expect(result).toMatchObject({ failed: 1, retried: 0 });
  });

  it("isolates failures — a throwing item does not stop the batch", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }, { id: "oj-2" }]);
    prisma.outreachJob.findUnique
      .mockResolvedValueOnce({ ...baseJob, id: "oj-1" })
      .mockResolvedValueOnce({ ...baseJob, id: "oj-2", leadId: "lead-2" });
    prisma.lead.findUnique
      .mockResolvedValueOnce({ ...baseLead, phone: null })
      .mockResolvedValueOnce({ ...baseLead, id: "lead-2", phone: null });
    vi.mocked(generateWebsiteForLead)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ website: { id: "web-2", slug: "s" }, needsPhotos: false } as never);

    const result = await run(prisma);

    expect(result).toMatchObject({ processed: 2, done: 1, retried: 1 });
  });

  it("stops claiming new items once the time budget is exhausted", async () => {
    prisma.outreachJob.findMany.mockResolvedValue([{ id: "oj-1" }, { id: "oj-2" }]);

    const result = await run(prisma, { timeBudgetMs: -1 });

    expect(result.processed).toBe(0);
    expect(generateWebsiteForLead).not.toHaveBeenCalled();
  });
});

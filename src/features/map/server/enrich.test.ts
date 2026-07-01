import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import { applyEnrichmentResults, writeEnrichInput } from "./enrich";

function createMockPrisma() {
  return {
    lead: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    activity: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

async function makeOutputDir(rows: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "enrich-test-"));
  await fs.writeFile(path.join(dir, "enriched.json"), JSON.stringify(rows), "utf-8");
  return dir;
}

describe("applyEnrichmentResults", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it("applies enrichment fields and logs a LEAD_ENRICHED activity", async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
    const dir = await makeOutputDir([
      {
        leadId: "lead-1",
        phone: "512-555-1234",
        website: "https://freshwrench.example",
        email: "hi@freshwrench.example",
        rating: 4.7,
        reviews: 12,
      },
    ]);

    const res = await applyEnrichmentResults({
      prisma: prisma as unknown as PrismaClient,
      organizationId: "org-1",
      userId: "user-1",
      outputDir: dir,
    });

    expect(res).toEqual({ updated: 1 });
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: {
        phone: "512-555-1234",
        website: "https://freshwrench.example",
        email: "hi@freshwrench.example",
        rating: 4.7,
        reviewCount: 12,
      },
    });
    expect(prisma.activity.create).toHaveBeenCalledTimes(1);
    expect(prisma.activity.create.mock.calls[0][0].data).toMatchObject({
      leadId: "lead-1",
      type: "LEAD_ENRICHED",
      organizationId: "org-1",
    });
  });

  it("never wipes existing data with empty enrichment values", async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
    const dir = await makeOutputDir([
      { leadId: "lead-1", phone: null, website: "", email: null, rating: null, reviews: null },
    ]);

    const res = await applyEnrichmentResults({
      prisma: prisma as unknown as PrismaClient,
      organizationId: "org-1",
      userId: "user-1",
      outputDir: dir,
    });

    expect(res).toEqual({ updated: 0 });
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it("skips leads that are not in the caller's organization", async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const dir = await makeOutputDir([
      { leadId: "foreign-lead", phone: "555", email: "x@y.z" },
    ]);

    const res = await applyEnrichmentResults({
      prisma: prisma as unknown as PrismaClient,
      organizationId: "org-1",
      userId: "user-1",
      outputDir: dir,
    });

    expect(res).toEqual({ updated: 0 });
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-lead", organizationId: "org-1" },
      select: { id: true },
    });
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("skips rows without a leadId", async () => {
    const dir = await makeOutputDir([{ phone: "555" }, null]);

    const res = await applyEnrichmentResults({
      prisma: prisma as unknown as PrismaClient,
      organizationId: "org-1",
      userId: "user-1",
      outputDir: dir,
    });

    expect(res).toEqual({ updated: 0 });
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
  });

  it("throws when enriched.json is missing (caller marks the job failed)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "enrich-test-"));
    await expect(
      applyEnrichmentResults({
        prisma: prisma as unknown as PrismaClient,
        organizationId: "org-1",
        userId: "user-1",
        outputDir: dir,
      }),
    ).rejects.toThrow();
  });
});

describe("writeEnrichInput", () => {
  it("writes the businesses payload as enrich-input.json", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "enrich-test-"));
    const businesses = [
      { leadId: "lead-1", name: "Fresh Wrench", website: null, phone: "512" },
    ];

    await writeEnrichInput(dir, businesses);

    const raw = await fs.readFile(path.join(dir, "enrich-input.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({ businesses });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { logActivity, ActivityType } from "./activity";

function makePrisma() {
  return {
    lead: { findUnique: vi.fn() },
    activity: { create: vi.fn() },
  };
}

describe("logActivity", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1" });
    prisma.activity.create.mockResolvedValue({});
  });

  it("creates an activity row with all provided fields", async () => {
    await logActivity(prisma as never, {
      leadId: "lead-1",
      userId: "user-1",
      type: ActivityType.LEAD_CREATED,
      description: "Lead created",
      organizationId: "org-1",
    });

    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: {
        leadId: "lead-1",
        userId: "user-1",
        type: ActivityType.LEAD_CREATED,
        description: "Lead created",
        organizationId: "org-1",
      },
    });
  });

  it("skips the lead lookup when organizationId is provided by the caller", async () => {
    await logActivity(prisma as never, {
      leadId: "lead-1",
      userId: "user-1",
      type: ActivityType.CALL_LOGGED,
      description: "Call logged",
      organizationId: "org-1",
    });

    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
  });

  it("looks up organizationId from the lead when caller does not provide it", async () => {
    await logActivity(prisma as never, {
      leadId: "lead-2",
      userId: "user-1",
      type: ActivityType.CALL_LOGGED,
      description: "Call logged",
    });

    expect(prisma.lead.findUnique).toHaveBeenCalledWith({
      where: { id: "lead-2" },
      select: { organizationId: true },
    });
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-1" }) }),
    );
  });

  it("writes null organizationId when the lead does not exist", async () => {
    prisma.lead.findUnique.mockResolvedValue(null);

    await logActivity(prisma as never, {
      leadId: "missing",
      userId: "user-1",
      type: ActivityType.LEAD_DELETED,
      description: "Deleted",
    });

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: null }) }),
    );
  });

  it("swallows errors and never throws", async () => {
    prisma.activity.create.mockRejectedValue(new Error("DB connection lost"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logActivity(prisma as never, {
        leadId: "lead-1",
        userId: "user-1",
        type: ActivityType.LEAD_CREATED,
        description: "Test",
        organizationId: "org-1",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("logs a warning when the lead lookup itself throws", async () => {
    prisma.lead.findUnique.mockRejectedValue(new Error("Timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logActivity(prisma as never, {
        leadId: "lead-1",
        userId: "user-1",
        type: ActivityType.NOTE_ADDED,
        description: "Note added",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

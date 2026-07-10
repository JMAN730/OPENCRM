import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { requireVisibleLead, visibleLeadWhere } from "./lead-visibility";

function makeCtx(role = "USER") {
  return {
    organizationId: "org-1",
    session: { user: { id: "user-1", role } },
    prisma: {
      team: { findMany: vi.fn().mockResolvedValue([]) },
      lead: { findFirst: vi.fn() },
    },
  };
}

describe("visibleLeadWhere", () => {
  it("returns org-wide visibility for ADMIN", async () => {
    const ctx = makeCtx("ADMIN");

    await expect(visibleLeadWhere(ctx as never)).resolves.toEqual({
      organizationId: "org-1",
    });
    expect(ctx.prisma.team.findMany).not.toHaveBeenCalled();
  });

  it("returns assigned-lead visibility for non-admin users", async () => {
    const ctx = makeCtx("USER");

    await expect(visibleLeadWhere(ctx as never)).resolves.toEqual({
      organizationId: "org-1",
      assignedToId: { in: ["user-1"] },
    });
  });
});

describe("requireVisibleLead", () => {
  it("loads a lead through the current visibility rule", async () => {
    const ctx = makeCtx("USER");
    ctx.prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });

    await expect(
      requireVisibleLead(ctx as never, "lead-1", { select: { id: true } }),
    ).resolves.toEqual({ id: "lead-1" });

    expect(ctx.prisma.lead.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: "lead-1",
        organizationId: "org-1",
        assignedToId: { in: ["user-1"] },
      },
    });
  });

  it("throws NOT_FOUND when the lead is outside visibility", async () => {
    const ctx = makeCtx("USER");
    ctx.prisma.lead.findFirst.mockResolvedValue(null);

    await expect(requireVisibleLead(ctx as never, "lead-1")).rejects.toBeInstanceOf(
      TRPCError,
    );
    await expect(requireVisibleLead(ctx as never, "lead-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

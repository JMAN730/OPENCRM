import { describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("platformRouter", () => {
  it("rejects non-super-admins even if they are org ADMINs", async () => {
    const { caller } = createTestCaller({
      sessionOverrides: { role: "ADMIN", isSuperAdmin: false },
    });

    await expect(caller.platform.overview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.platform.organizations()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.platform.users()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns cross-org overview counts for a super admin", async () => {
    const { caller, prisma } = createTestCaller({
      sessionOverrides: { isSuperAdmin: true },
    });
    prisma.organization.count.mockResolvedValue(12);
    prisma.user.count.mockResolvedValue(48);
    prisma.team.count.mockResolvedValue(7);
    prisma.lead.count.mockResolvedValue(1000);
    prisma.callLog.count.mockResolvedValue(500);
    prisma.organizationSubscription.groupBy
      .mockResolvedValueOnce([{ planTier: "PRO", _count: { id: 3 } }])
      .mockResolvedValueOnce([{ status: "ACTIVE", _count: { id: 3 } }]);

    const result = await caller.platform.overview();

    expect(result.organizations).toBe(12);
    expect(result.users).toBe(48);
    expect(result.teams).toBe(7);
    expect(result.subscriptionsByTier).toEqual([{ planTier: "PRO", count: 3 }]);
  });

  it("lists organizations across all tenants without an org filter", async () => {
    const { caller, prisma } = createTestCaller({
      sessionOverrides: { isSuperAdmin: true },
    });
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-a",
        name: "Acme",
        createdAt: new Date("2026-01-01"),
        subscription: { planTier: "PRO", status: "ACTIVE", seatLimit: 10, trialEndsAt: null },
        _count: { users: 4, teams: 1, leads: 200 },
      },
    ]);

    const result = await caller.platform.organizations();

    // Must not be scoped to the caller's organization.
    const where = prisma.organization.findMany.mock.calls[0][0].where;
    expect(where).toBeUndefined();
    expect(result[0]).toMatchObject({ id: "org-a", name: "Acme", planTier: "PRO", userCount: 4 });
  });

  it("never selects the password hash when listing users", async () => {
    const { caller, prisma } = createTestCaller({
      sessionOverrides: { isSuperAdmin: true },
    });
    prisma.user.findMany.mockResolvedValue([]);

    await caller.platform.users({ search: "jane" });

    const select = prisma.user.findMany.mock.calls[0][0].select;
    expect(select.password).toBeUndefined();
    expect(select.email).toBe(true);
  });
});

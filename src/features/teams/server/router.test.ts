import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";

vi.mock("@/server/teams/scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/teams/scope")>();
  return {
    ...actual,
    invalidateLeadScope: vi.fn().mockResolvedValue(undefined),
  };
});

describe("teamsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  describe("memberDetail", () => {
    it("sources recent calls and call count from touch activities", async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: "user-1",
        name: "Rep",
        email: "rep@example.com",
        image: null,
        role: "USER",
        teamId: null,
        team: null,
      });
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.task.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);
      prisma.activity.findMany.mockResolvedValue([
        {
          id: "a1",
          outcome: "ANSWERED",
          createdAt: new Date("2026-07-01T10:00:00Z"),
          leadId: "lead-1",
          lead: { id: "lead-1", firstName: "Ada", lastName: null, company: "Acme Lawn" },
        },
      ]);
      prisma.activity.count.mockResolvedValue(12);

      const result = await caller.teams.memberDetail({ userId: "user-1" });

      expect(result.callCount).toBe(12);
      expect(result.recentCalls).toHaveLength(1);

      const findArgs = prisma.activity.findMany.mock.calls[0][0];
      expect(findArgs.where).toMatchObject({
        userId: "user-1",
        organizationId: "org-1",
        type: "CALL_OUTCOME",
        outcome: { not: "NOT_CONTACTED" },
      });
      const countArgs = prisma.activity.count.mock.calls[0][0];
      expect(countArgs.where).toMatchObject({
        userId: "user-1",
        organizationId: "org-1",
        type: "CALL_OUTCOME",
        outcome: { not: "NOT_CONTACTED" },
      });
    });
  });

  describe("inviteByEmail", () => {
    it("rejects non-admin callers before granting roles", async () => {
      const { caller } = createTestCaller({
        sessionOverrides: { role: "MANAGER" },
      });

      await expect(
        caller.teams.inviteByEmail({
          email: "user@example.com",
          role: "USER",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("validates that teamId belongs to the caller's organization", async () => {
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(
        caller.teams.inviteByEmail({
          email: "user@example.com",
          role: "USER",
          teamId: "team-other-org",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("creates a pending Invitation row with a hashed token after replacing any prior pending invite", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.count.mockResolvedValue(1);
      prisma.invitation.count.mockResolvedValue(0);
      prisma.invitation.deleteMany.mockResolvedValue({ count: 0 });
      prisma.invitation.create.mockResolvedValue({});
      prisma.organization.findUnique.mockResolvedValue({ name: "Acme" });

      await caller.teams.inviteByEmail({
        email: "new@example.com",
        name: "New User",
        role: "USER",
      });

      expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
        where: {
          email: "new@example.com",
          organizationId: "org-1",
          status: "PENDING",
        },
      });
      // The token itself is random, but the create call must include the
      // hashed token, org, email, and role.
      const createArg = prisma.invitation.create.mock.calls[0][0];
      expect(createArg.data.email).toBe("new@example.com");
      expect(createArg.data.organizationId).toBe("org-1");
      expect(createArg.data.role).toBe("USER");
      expect(typeof createArg.data.tokenHash).toBe("string");
      expect(createArg.data.tokenHash.length).toBe(64); // sha-256 hex
    });

    it("blocks invites when the seat limit is reached", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.count.mockResolvedValue(10);
      prisma.invitation.count.mockResolvedValue(0);
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        planTier: "PRO",
        status: "ACTIVE",
        seatLimit: 10,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });

      await expect(
        caller.teams.inviteByEmail({
          email: "new@example.com",
          role: "USER",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });
  });

  describe("setMembership", () => {
    it("forbids callers who are neither admins nor leaders of the target team", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.user.findFirst.mockResolvedValue({ id: "user-2", teamId: "team-1" });
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(
        caller.teams.setMembership({ userId: "user-2", teamId: "team-1" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows a team leader to add a member to a team they lead", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.user.findFirst.mockResolvedValue({ id: "user-2", teamId: null });
      prisma.team.findFirst
        .mockResolvedValueOnce({ id: "team-1" })
        .mockResolvedValueOnce({ leaderId: "user-1" });
      prisma.user.update.mockResolvedValue({ id: "user-2", teamId: "team-1" });

      await caller.teams.setMembership({ userId: "user-2", teamId: "team-1" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { teamId: "team-1" },
      });
    });

    it("requires admins to target a team inside their organization", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "user-2", teamId: null });
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(
        caller.teams.setMembership({ userId: "user-2", teamId: "team-other-org" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("promoteRole", () => {
    it("blocks MANAGER from demoting an ADMIN to USER", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "MANAGER" },
      });
      prisma.user.findFirst.mockResolvedValue({ id: "admin-user", role: "ADMIN" });

      await expect(
        caller.teams.promoteRole({ userId: "admin-user", role: "USER" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows ADMIN to demote another ADMIN", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "ADMIN" },
      });
      prisma.user.findFirst.mockResolvedValue({ id: "other-admin", role: "ADMIN" });
      prisma.user.update.mockResolvedValue({ id: "other-admin", role: "USER" });

      await caller.teams.promoteRole({ userId: "other-admin", role: "USER" });
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it("allows MANAGER to demote a USER", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "MANAGER" },
      });
      prisma.user.findFirst.mockResolvedValue({ id: "some-user", role: "USER" });
      prisma.user.update.mockResolvedValue({ id: "some-user", role: "USER" });

      await caller.teams.promoteRole({ userId: "some-user", role: "USER" });
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it("blocks a MANAGER from demoting a peer MANAGER (#187-3)", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "MANAGER" },
      });
      prisma.user.findFirst.mockResolvedValue({ id: "peer-manager", role: "MANAGER" });

      await expect(
        caller.teams.promoteRole({ userId: "peer-manager", role: "USER" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});

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

  describe("inviteUser", () => {
    it("rejects non-admin callers before granting roles", async () => {
      const { caller } = createTestCaller({
        sessionOverrides: { role: "MANAGER" },
      });

      await expect(
        caller.teams.inviteUser({
          name: "Example User",
          email: "user@example.com",
          password: "password123",
          role: "USER",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("validates that teamId belongs to the caller's organization", async () => {
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(
        caller.teams.inviteUser({
          name: "Example User",
          email: "user@example.com",
          password: "password123",
          role: "USER",
          teamId: "team-other-org",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
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
});

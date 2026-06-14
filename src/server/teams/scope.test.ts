import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeDel } from "@/lib/redis";
import {
  resolveLeadScope,
  invalidateLeadScope,
  getLeadScope,
  leadWhereFromScope,
} from "./scope";

// The global setup mocks @/lib/redis; cast to vi.Mock to control per-test behavior.
const mockSafeDel = safeDel as ReturnType<typeof vi.fn>;

function makePrisma() {
  return { team: { findMany: vi.fn() } };
}

describe("resolveLeadScope", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    prisma.team.findMany.mockResolvedValue([]);
  });

  it("returns all-scope for ADMIN without touching the teams table", async () => {
    const scope = await resolveLeadScope(prisma as never, "user-admin", "org-1", "ADMIN");

    expect(scope).toEqual({ kind: "all", organizationId: "org-1" });
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it("returns user-only scope when the user leads no teams", async () => {
    const scope = await resolveLeadScope(prisma as never, "user-1", "org-1", "USER");

    expect(scope).toEqual({ kind: "users", organizationId: "org-1", userIds: ["user-1"] });
  });

  it("returns scope including all team members when user is a team leader", async () => {
    prisma.team.findMany.mockResolvedValue([
      { id: "team-1", users: [{ id: "user-2" }, { id: "user-3" }] },
    ]);

    const scope = await resolveLeadScope(prisma as never, "user-1", "org-1", "MANAGER");

    expect(scope.kind).toBe("users");
    if (scope.kind === "users") {
      expect(scope.userIds).toContain("user-1");
      expect(scope.userIds).toContain("user-2");
      expect(scope.userIds).toContain("user-3");
      expect(scope.userIds).toHaveLength(3);
    }
  });

  it("deduplicates userIds when a member appears in multiple teams", async () => {
    prisma.team.findMany.mockResolvedValue([
      { id: "team-1", users: [{ id: "user-1" }, { id: "user-2" }] },
      { id: "team-2", users: [{ id: "user-2" }, { id: "user-3" }] },
    ]);

    const scope = await resolveLeadScope(prisma as never, "user-1", "org-1", "MANAGER");

    if (scope.kind === "users") {
      const unique = new Set(scope.userIds);
      expect(unique.size).toBe(scope.userIds.length);
      expect(scope.userIds).toHaveLength(3);
    }
  });

  it("scopes the team query to the correct organizationId and leaderId", async () => {
    await resolveLeadScope(prisma as never, "user-1", "org-1", "USER");

    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1", leaderId: "user-1" }),
      }),
    );
  });

  it("returns the leader's own id even when all their teams have no members", async () => {
    prisma.team.findMany.mockResolvedValue([{ id: "team-1", users: [] }]);

    const scope = await resolveLeadScope(prisma as never, "user-leader", "org-1", "MANAGER");

    expect(scope.kind).toBe("users");
    if (scope.kind === "users") {
      expect(scope.userIds).toEqual(["user-leader"]);
    }
  });
});

describe("invalidateLeadScope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls safeDel with the correct scope cache key", async () => {
    await invalidateLeadScope("user-42");
    expect(mockSafeDel).toHaveBeenCalledWith("scope:lead:user-42");
  });
});

describe("getLeadScope", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    prisma.team.findMany.mockResolvedValue([]);
  });

  it("throws when ctx does not have organizationId", () => {
    const ctx = { prisma };
    expect(() => getLeadScope(ctx as never, "user-1", "USER")).toThrow("organizationId");
  });

  it("memoizes: returns the exact same Promise for the same user within a request", () => {
    const ctx = { prisma, organizationId: "org-1" };
    const p1 = getLeadScope(ctx as never, "user-1", "USER");
    const p2 = getLeadScope(ctx as never, "user-1", "USER");
    expect(p1).toBe(p2);
  });

  it("issues distinct Promises for different users within the same request", () => {
    const ctx = { prisma, organizationId: "org-1" };
    const p1 = getLeadScope(ctx as never, "user-1", "USER");
    const p2 = getLeadScope(ctx as never, "user-2", "USER");
    expect(p1).not.toBe(p2);
  });

  it("issues distinct Promises across different org contexts", () => {
    const ctx1 = { prisma, organizationId: "org-1" };
    const ctx2 = { prisma, organizationId: "org-2" };
    const p1 = getLeadScope(ctx1 as never, "user-1", "USER");
    const p2 = getLeadScope(ctx2 as never, "user-1", "USER");
    expect(p1).not.toBe(p2);
  });
});

describe("leadWhereFromScope", () => {
  it("returns an organizationId-only clause for all-scope", () => {
    const where = leadWhereFromScope({ kind: "all", organizationId: "org-1" });
    expect(where).toEqual({ organizationId: "org-1" });
  });

  it("returns an assignedToId IN filter for users-scope", () => {
    const where = leadWhereFromScope({
      kind: "users",
      organizationId: "org-1",
      userIds: ["u1", "u2"],
    });
    expect(where).toEqual({
      organizationId: "org-1",
      assignedToId: { in: ["u1", "u2"] },
    });
  });
});

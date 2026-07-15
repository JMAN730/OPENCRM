import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createTestCaller } from "@/test/trpc";

describe("supportRouter.submit", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("creates a report scoped to the caller's org and user", async () => {
    prisma.bugReport.create.mockResolvedValue({ id: "bug-1", createdAt: new Date() });

    const result = await caller.support.submit({
      message: "  Leads list crashes on filter  ",
      pageUrl: "https://app.example.com/leads",
    });

    expect(result).toMatchObject({ id: "bug-1" });
    const args = prisma.bugReport.create.mock.calls[0][0];
    expect(args.data).toMatchObject({
      organizationId: "org-1",
      submittedById: "user-1",
      // Zod trims the message before it reaches Prisma.
      message: "Leads list crashes on filter",
      pageUrl: "https://app.example.com/leads",
    });
  });

  it("stores null pageUrl when omitted", async () => {
    prisma.bugReport.create.mockResolvedValue({ id: "bug-2", createdAt: new Date() });

    await caller.support.submit({ message: "Something is off" });

    const args = prisma.bugReport.create.mock.calls[0][0];
    expect(args.data.pageUrl).toBeNull();
  });

  it("rejects an empty message", async () => {
    await expect(caller.support.submit({ message: "   " })).rejects.toBeInstanceOf(TRPCError);
    expect(prisma.bugReport.create).not.toHaveBeenCalled();
  });

  it("is available to non-admin members", async () => {
    ({ caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } }));
    prisma.bugReport.create.mockResolvedValue({ id: "bug-3", createdAt: new Date() });

    await expect(caller.support.submit({ message: "help" })).resolves.toMatchObject({ id: "bug-3" });
  });
});

describe("supportRouter.list", () => {
  it("returns the org's reports for an admin, newest first", async () => {
    const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "ADMIN" } });
    prisma.bugReport.findMany.mockResolvedValue([
      { id: "bug-1", message: "a", pageUrl: null, createdAt: new Date(), submittedBy: null },
    ]);

    const result = await caller.support.list();

    expect(result).toHaveLength(1);
    const args = prisma.bugReport.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ organizationId: "org-1" });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("forbids non-admin callers", async () => {
    const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } });

    await expect(caller.support.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.bugReport.findMany).not.toHaveBeenCalled();
  });
});

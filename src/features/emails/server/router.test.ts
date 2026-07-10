import { beforeEach, describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("emailsRouter", () => {
  describe("send", () => {
    it("checks draft access through lead visibility before sending", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.emailDraft.findFirst.mockResolvedValue(null);

      await expect(caller.emails.send({ id: "draft-1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      expect(prisma.emailDraft.findFirst).toHaveBeenCalledWith({
        where: {
          id: "draft-1",
          organizationId: "org-1",
          lead: {
            organizationId: "org-1",
            assignedToId: { in: ["user-1"] },
          },
        },
        select: { id: true },
      });
    });
  });

  describe("getDraftForLead", () => {
    let caller: ReturnType<typeof createTestCaller>["caller"];
    let prisma: ReturnType<typeof createTestCaller>["prisma"];

    beforeEach(() => {
      ({ caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      }));
    });

    it("requires the lead to be visible before returning a draft", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      prisma.emailDraft.findFirst.mockResolvedValue({ id: "draft-1" });

      await expect(caller.emails.getDraftForLead({ leadId: "lead-1" })).resolves.toEqual({
        id: "draft-1",
      });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: "lead-1",
          organizationId: "org-1",
          assignedToId: { in: ["user-1"] },
        },
      });
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";

const { create: openaiCreate } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create: openaiCreate } } })),
}));

const validPersona = {
  name: "Skeptical Owner",
  description: "Defensive, busy",
  systemPrompt: "You are {{leadName}} at {{company}} in {{industry}}.",
  firstMessage: "Hello?",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  voiceName: "Rachel (calm female)",
};

describe("trainerRouter — personas", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => { ({ caller, prisma } = createTestCaller()); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("lists personas for the caller's org", async () => {
    prisma.trainingPersona.findMany.mockResolvedValue([{ id: "p1" }]);
    const result = await caller.trainer.listPersonas();
    expect(result).toEqual([{ id: "p1" }]);
    expect(prisma.trainingPersona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("creates a persona as ADMIN", async () => {
    prisma.trainingPersona.create.mockResolvedValue({ id: "p1", ...validPersona });
    await caller.trainer.createPersona(validPersona);
    expect(prisma.trainingPersona.create).toHaveBeenCalledWith({
      data: { ...validPersona, organizationId: "org-1" },
    });
  });

  it("forbids non-admins from creating", async () => {
    ({ caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } }));
    await expect(caller.trainer.createPersona(validPersona)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects update of a persona from another org", async () => {
    prisma.trainingPersona.findUnique.mockResolvedValue({ organizationId: "org-2" });
    await expect(caller.trainer.updatePersona({ id: "p1", ...validPersona }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes a persona in the caller's org", async () => {
    prisma.trainingPersona.findUnique.mockResolvedValue({ organizationId: "org-1" });
    prisma.trainingPersona.delete.mockResolvedValue({ id: "p1" });
    await caller.trainer.deletePersona({ id: "p1" });
    expect(prisma.trainingPersona.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});

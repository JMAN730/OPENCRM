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

describe("trainerRouter — startSession", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => { ({ caller, prisma } = createTestCaller()); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function stubLeadAndPersona() {
    prisma.lead.findUnique.mockResolvedValue({
      organizationId: "org-1", company: "Acme", firstName: null, lastName: null, source: "Plumbing",
    });
    prisma.trainingPersona.findUnique.mockResolvedValue({
      organizationId: "org-1",
      systemPrompt: "Talk to {{leadName}} in {{industry}}.",
      firstMessage: "Hi {{leadName}}.",
      voiceId: "voice_1",
    });
  }

  it("mints a signed url and assembles interpolated overrides", async () => {
    stubLeadAndPersona();
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_1");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signed_url: "wss://signed" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await caller.trainer.startSession({ leadId: "lead-1", personaId: "p1" });

    expect(result.signedUrl).toBe("wss://signed");
    expect(result.overrides.agent.prompt.prompt).toBe("Talk to Acme in Plumbing.");
    expect(result.overrides.agent.firstMessage).toBe("Hi Acme.");
    expect(result.overrides.tts.voiceId).toBe("voice_1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("get-signed-url?agent_id=agent_1"),
      expect.objectContaining({ headers: { "xi-api-key": "k" } }),
    );
  });

  it("throws PRECONDITION_FAILED when env is missing", async () => {
    stubLeadAndPersona();
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "");
    await expect(caller.trainer.startSession({ leadId: "lead-1", personaId: "p1" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws NOT_FOUND when the lead is in another org", async () => {
    prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-2" });
    await expect(caller.trainer.startSession({ leadId: "lead-1", personaId: "p1" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

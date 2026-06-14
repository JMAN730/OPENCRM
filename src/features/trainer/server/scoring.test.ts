import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
}));

import { scoreCall } from "./scoring";
import type { Scorecard } from "../types";

const sample: Scorecard = {
  overallScore: 72,
  opening: { score: 80, feedback: "Clear intro." },
  objectionHandling: { score: 65, feedback: "Defended price." },
  valueProposition: { score: 70, feedback: "Decent." },
  callToAction: { score: 55, feedback: "No next step." },
  highlights: ["Good tone"],
  improvements: ["Ask for the meeting"],
};

describe("scoreCall", () => {
  afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });

  it("returns null when no API key is configured", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const result = await scoreCall({ transcript: [], personaName: "P", leadName: "L" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("parses the DeepSeek JSON response into a scorecard", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(sample) } }] });
    const result = await scoreCall({
      transcript: [{ role: "agent", text: "Hello?", at: 1 }],
      personaName: "Skeptical Owner",
      leadName: "Acme",
    });
    expect(result).toEqual(sample);
    expect(create).toHaveBeenCalledOnce();
  });
});

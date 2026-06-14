export interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  at: number;
}

export interface ScoreCategory {
  score: number;
  feedback: string;
}

export interface Scorecard {
  overallScore: number;
  opening: ScoreCategory;
  objectionHandling: ScoreCategory;
  valueProposition: ScoreCategory;
  callToAction: ScoreCategory;
  highlights: string[];
  improvements: string[];
}

export interface StartSessionOverrides {
  agent: {
    prompt: { prompt: string };
    firstMessage: string;
    language: string;
  };
  tts: { voiceId: string };
}

export interface StartSessionResult {
  signedUrl: string;
  overrides: StartSessionOverrides;
}

export interface PersonaInput {
  name: string;
  description: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  voiceName: string;
}

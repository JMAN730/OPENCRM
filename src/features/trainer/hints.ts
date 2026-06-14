export interface HintPattern {
  pattern: RegExp;
  hint: string;
}

export const HINT_PATTERNS: HintPattern[] = [
  { pattern: /price|cost|expensive|budget/i, hint: "Price objection — pivot to ROI, don't defend the number" },
  { pattern: /not interested/i, hint: "Ask an open question to uncover the real objection" },
  { pattern: /send.*(email|info|brochure)/i, hint: "Brush-off — give a value statement before agreeing" },
  { pattern: /not the right person|talk to/i, hint: "Ask who handles decisions for this area" },
  { pattern: /call me back|bad time/i, hint: "Secure a specific callback time before you hang up" },
  { pattern: /already.*(use|have|work with)/i, hint: "Ask what they'd change about their current solution" },
];

/** Returns the hint for the first matching pattern, or null. */
export function matchHint(text: string): string | null {
  for (const { pattern, hint } of HINT_PATTERNS) {
    if (pattern.test(text)) return hint;
  }
  return null;
}

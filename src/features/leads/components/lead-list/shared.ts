export type Lead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  status: string;
  source?: string | null;
  callOutcome?: string | null;
  callNotes?: string | null;
  createdAt: string;
  assignedToId?: string | null;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
};

export type SessionUser = { role?: string };

export type LeadNote = {
  id: string;
  content: string;
  createdAt: string | Date;
};

export type AssignableUser = {
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null;
};

export type LeadTemperature = "hot" | "warm" | "cool";
export type LeadSortKey = keyof Lead | "score";
export type LeadSort = { key: LeadSortKey; dir: "asc" | "desc" };

export const STATUS_LABELS: Record<string, { cls: string; label: string }> = {
  NOT_CONTACTED: { cls: "plain", label: "Not Contacted" },
  CONNECTED: { cls: "pos", label: "Connected" },
  AI_VOICEMAIL: { cls: "warn", label: "AI Voicemail" },
  NO_ANSWER: { cls: "cool", label: "No Answer" },
  HUNG_UP: { cls: "neg", label: "Hung Up" },
};

export const STAGE_ORDER = [
  "CONNECTED",
  "AI_VOICEMAIL",
  "NO_ANSWER",
  "HUNG_UP",
  "NOT_CONTACTED",
];

export const OUTCOMES = [
  {
    id: "ANSWERED",
    label: "Connected",
    tone: "pos",
    hint: "Reached the lead, had a conversation",
  },
  {
    id: "AI_VOICEMAIL",
    label: "AI Voicemail",
    tone: "warn",
    hint: "AI voicemail screen, message left",
  },
  {
    id: "NO_ANSWER",
    label: "No Answer",
    tone: "cool",
    hint: "Ringed out, no pickup",
  },
  {
    id: "HUNG_UP",
    label: "Hung Up",
    tone: "neg",
    hint: "Picked up but ended the call",
  },
  {
    id: "NOT_CONTACTED",
    label: "Not Contacted",
    tone: "cool",
    hint: "Hasn't been reached yet",
  },
] as const;

export function fullNameOf(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.company || "Lead";
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function avatarClass(seed: string) {
  const number = ((seed.charCodeAt(0) || 0) % 6) + 1;
  return `c${number}`;
}

export function scoreOf(lead: Lead): number {
  switch (lead.status) {
    case "CONNECTED":
      return 90;
    case "AI_VOICEMAIL":
      return 65;
    case "NO_ANSWER":
      return 45;
    case "NOT_CONTACTED":
      return 30;
    case "HUNG_UP":
      return 15;
    default:
      return 30;
  }
}

export function tempOf(score: number): LeadTemperature {
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  return "cool";
}

export function tempLabel(temperature: LeadTemperature) {
  return temperature === "hot"
    ? "Hot"
    : temperature === "warm"
      ? "Warm"
      : "Cool";
}

export function relativeTime(iso: string | Date) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "-";

  const diffMs = Date.now() - time;
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

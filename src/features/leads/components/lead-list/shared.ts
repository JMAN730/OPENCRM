"use client";

export type Lead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  status: string;
  temperatureOverride?: "HOT" | "WARM" | "COOL" | null;
  source?: string | null;
  callOutcome?: string | null;
  callNotes?: string | null;
  starred?: boolean | null;
  touchCount?: number | null;
  lastTouchedAt?: string | Date | null;
  qualificationSummary?: string | null;
  createdAt: string;
  assignedToId?: string | null;
  customOutcomeId?: string | null;
  qualificationSummary?: string | null;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  customOutcome?: {
    id: string;
    label: string;
    hint?: string | null;
  } | null;
  tags?: Array<{
    id: string;
    name: string;
  }> | null;
  _count?: {
    calls?: number;
    notes?: number;
  } | null;
};

export type SessionUser = {
  id?: string;
  role?: string;
};

export type LeadNote = {
  id: string;
  content: string;
  createdAt: string | Date;
  userId: string;
};

export type AssignableUser = {
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null;
};

export type LeadTemperature = "hot" | "warm" | "cool";
export type LeadSortKey = keyof Lead | "score" | "owner";
export type LeadSort = { key: LeadSortKey; dir: "asc" | "desc" };

export type ScoringRuleConfig = {
  id: string;
  factor: string;
  label: string;
  maxPoints: number;
  weight: number;
  config?: Record<string, number> | null;
  isActive: boolean;
  sortOrder: number;
};

export type ScoreBreakdownItem = {
  factor: string;
  label: string;
  points: number;
  maxPoints: number;
  weight: number;
};

export const LEAD_VISIBLE_COLUMNS = [
  "Lead",
  "Company",
  "Owner",
  "Stage",
  "Score",
  "Touches",
  "Next action",
  "Last touch",
] as const;

export type LeadVisibleColumn = (typeof LEAD_VISIBLE_COLUMNS)[number];

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

export function outcomeLabel(lead: Lead): string | null {
  if (!lead.callOutcome || lead.callOutcome === "NOT_CONTACTED") return null;
  if (lead.callOutcome === "CUSTOM") return lead.customOutcome?.label ?? "Custom";
  return OUTCOMES.find((o) => o.id === lead.callOutcome)?.label ?? null;
}

function engagementKeyOf(lead: Lead) {
  return lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED"
    ? lead.callOutcome
    : lead.status;
}

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

function computeFactorPoints(factor: string, lead: Lead, maxPoints: number, weight: number, config?: Record<string, number> | null): number {
  const engagementKey = engagementKeyOf(lead);

  switch (factor) {
    case "star_rating": {
      const rating = typeof lead.rating === "number" ? Math.max(0, Math.min(5, lead.rating)) : null;
      if (rating == null) return 0;
      return Math.round((rating / 5) * maxPoints * weight);
    }
    case "review_count": {
      const reviewCount = typeof lead.reviewCount === "number" ? Math.max(0, Math.floor(lead.reviewCount)) : null;
      if (reviewCount == null) return 0;
      return Math.round(Math.min(maxPoints, Math.log10(reviewCount + 1) * (maxPoints / 2)) * weight);
    }
    case "has_website":
      return lead.website ? Math.round(maxPoints * weight) : 0;
    case "call_activity": {
      const map = config ?? { ANSWERED: 25, CONNECTED: 25, AI_VOICEMAIL: 10, NOT_CONTACTED: 5, HUNG_UP: -10, NO_ANSWER: 0 };
      const raw = map[engagementKey] ?? 0;
      return Math.round(raw * weight);
    }
    case "lead_status": {
      const map = config ?? { CONNECTED: 15, AI_VOICEMAIL: 8, NO_ANSWER: 3, NOT_CONTACTED: 0, HUNG_UP: -5 };
      const raw = map[lead.status] ?? 0;
      return Math.round(raw * weight);
    }
    case "last_contacted": {
      // Proxy recency via updatedAt if available, else full score for contacted leads
      if (engagementKey === "NOT_CONTACTED" || engagementKey === "HUNG_UP") return 0;
      // If connected give full points (no updatedAt available in client type)
      return Math.round(maxPoints * weight);
    }
    case "appointment_booked":
      // Proxy: lead status CONNECTED = appointment likely booked
      return (lead.status === "CONNECTED" || engagementKey === "ANSWERED") ? Math.round(maxPoints * weight) : 0;
    case "business_category": {
      if (!config || !lead.source) return 0;
      const raw = config[lead.source] ?? 0;
      return Math.round(raw * weight);
    }
    default:
      return 0;
  }
}

export function scoreBreakdown(lead: Lead, rules: ScoringRuleConfig[]): ScoreBreakdownItem[] {
  return rules
    .filter((r) => r.isActive)
    .map((r) => {
      const raw = computeFactorPoints(r.factor, lead, r.maxPoints, r.weight, r.config);
      const clamped = Math.min(r.maxPoints * r.weight, Math.max(-(r.maxPoints * r.weight), raw));
      return { factor: r.factor, label: r.label, points: Math.round(clamped), maxPoints: r.maxPoints, weight: r.weight };
    });
}

export function scoreOf(lead: Lead, rules?: ScoringRuleConfig[]): number {
  if (!rules || rules.length === 0) {
    // Legacy hardcoded logic for backward compatibility
    const rating = typeof lead.rating === "number" ? Math.max(0, Math.min(5, lead.rating)) : null;
    const reviewCount =
      typeof lead.reviewCount === "number" ? Math.max(0, Math.floor(lead.reviewCount)) : null;

    const ratingScore = rating == null ? 0 : Math.round((rating / 5) * 40);
    const volumeScore =
      reviewCount == null ? 0 : Math.min(25, Math.round(Math.log10(reviewCount + 1) * 12));

    const engagementKey = engagementKeyOf(lead);
    const engagementScore =
      engagementKey === "CONNECTED" || engagementKey === "ANSWERED"
        ? 25
        : engagementKey === "AI_VOICEMAIL"
          ? 10
          : engagementKey === "NOT_CONTACTED"
            ? 5
            : engagementKey === "HUNG_UP"
              ? -10
              : 0;

    return Math.max(0, Math.min(100, ratingScore + volumeScore + engagementScore));
  }

  const total = scoreBreakdown(lead, rules).reduce((sum, item) => sum + item.points, 0);
  return Math.max(0, Math.min(100, total));
}

export function tempOf(score: number): LeadTemperature {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cool";
}

export function effectiveTempOf(lead: Lead): LeadTemperature {
  if (lead.temperatureOverride === "HOT") return "hot";
  if (lead.temperatureOverride === "WARM") return "warm";
  if (lead.temperatureOverride === "COOL") return "cool";
  return tempOf(scoreOf(lead));
}

export function normalizeWebsiteHref(website?: string | null): string | null {
  if (!website) return null;
  return website.startsWith("http://") || website.startsWith("https://")
    ? website
    : `https://${website}`;
}

export function reviewSummary(lead: Lead): string | null {
  if (typeof lead.rating !== "number" && typeof lead.reviewCount !== "number") {
    return null;
  }

  const ratingText = typeof lead.rating === "number" ? lead.rating.toFixed(1) : "-";
  const reviewCount = typeof lead.reviewCount === "number" ? lead.reviewCount : 0;
  const reviewsLabel = reviewCount === 1 ? "review" : "reviews";
  return `${ratingText} ★ (${reviewCount} ${reviewsLabel})`;
}

export function tempLabel(temperature: LeadTemperature) {
  return temperature === "hot" ? "Hot" : temperature === "warm" ? "Warm" : "Cool";
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

export function touchesOf(lead: Lead) {
  if (typeof lead.touchCount === "number") return lead.touchCount;

  // Fallback for older test fixtures or API shapes that only expose relation
  // counts.
  const calls = lead._count?.calls ?? 0;
  const notes = lead._count?.notes ?? 0;
  return calls + notes;
}

export function lastTouchOf(lead: Lead) {
  return lead.lastTouchedAt ?? lead.createdAt;
}

export function nextActionForLead(
  lead: Lead,
): { label?: string; state?: "due" | "today" | "upcoming" } {
  const engagementKey = engagementKeyOf(lead);

  if (engagementKey === "CONNECTED" || engagementKey === "ANSWERED") {
    return { label: "Follow up", state: "today" };
  }
  if (engagementKey === "AI_VOICEMAIL") {
    return { label: "Retry voicemail", state: "upcoming" };
  }
  if (engagementKey === "NO_ANSWER") {
    return { label: "Retry call", state: "today" };
  }
  if (engagementKey === "HUNG_UP") {
    return { label: "Re-engage", state: "due" };
  }

  return { label: "First touch", state: "today" };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

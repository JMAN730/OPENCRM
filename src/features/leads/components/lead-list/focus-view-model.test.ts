import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFocusSpotlightLeads } from "./focus-view-model";
import type { Lead } from "./shared";

type Task = {
  id: string;
  leadId: string | null;
  dueDate: string | null;
  title: string;
};

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    firstName: "Alex",
    lastName: "Stone",
    company: "Acme Corp",
    status: "CONNECTED",
    // High rating + lots of reviews + CONNECTED => hot
    rating: 4.9,
    reviewCount: 500,
    callOutcome: "ANSWERED",
    createdAt: "2026-05-14T13:00:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    leadId: "lead-1",
    dueDate: "2026-05-20T15:00:00.000Z",
    title: "Follow up",
    ...overrides,
  };
}

describe("buildFocusSpotlightLeads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces scheduled follow-ups for hot leads instead of the no-follow-up warning", () => {
    const lead = makeLead();
    const cards = buildFocusSpotlightLeads({
      leads: [lead],
      overdueTasks: [],
      dueTodayTasks: [],
      upcomingFollowUpTasks: [makeTask() as never],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0].urgency).toBe("hot");
    expect(cards[0].reason).toMatch(/Follow-up scheduled/);
    expect(cards[0].reason).not.toMatch(/no scheduled follow-up/i);
    expect(cards[0].dueLabel).toBeTruthy();
  });

  it("still shows the no-follow-up warning for hot leads without any open follow-up", () => {
    const lead = makeLead();
    const cards = buildFocusSpotlightLeads({
      leads: [lead],
      overdueTasks: [],
      dueTodayTasks: [],
      upcomingFollowUpTasks: [],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0].urgency).toBe("hot");
    expect(cards[0].reason).toBe("Hot lead with no scheduled follow-up");
    expect(cards[0].dueLabel).toBeNull();
  });

  it("ignores upcoming follow-ups attached to a different lead", () => {
    const lead = makeLead({ id: "lead-1" });
    const cards = buildFocusSpotlightLeads({
      leads: [lead],
      overdueTasks: [],
      dueTodayTasks: [],
      // Task belongs to a different lead — must NOT count for lead-1.
      upcomingFollowUpTasks: [makeTask({ leadId: "lead-other" }) as never],
    });

    expect(cards[0].reason).toBe("Hot lead with no scheduled follow-up");
  });

  it("picks the earliest upcoming follow-up when multiple exist", () => {
    const lead = makeLead();
    const cards = buildFocusSpotlightLeads({
      leads: [lead],
      overdueTasks: [],
      dueTodayTasks: [],
      upcomingFollowUpTasks: [
        makeTask({ id: "later", dueDate: "2026-06-01T10:00:00.000Z" }) as never,
        makeTask({ id: "earlier", dueDate: "2026-05-17T09:00:00.000Z" }) as never,
      ],
    });

    expect(cards[0].reason).toMatch(/Follow-up scheduled/);
    // Earlier task wins. With the current test clock (May 16, 2026) the
    // earlier due date (May 17) renders as "tomorrow"; the later one
    // would render as a date in June.
    expect(cards[0].dueLabel).toMatch(/tomorrow|May 17/);
    expect(cards[0].dueLabel).not.toMatch(/Jun/);
  });
});

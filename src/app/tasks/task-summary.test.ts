import { afterEach, describe, expect, it, vi } from "vitest";
import { getTaskSummaryCounts, isTaskOverdue } from "./task-summary";

describe("task summary counts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps overdue tasks out of the pending count", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const tasks = [
      { status: "PENDING", dueDate: "2026-05-14T15:00:00Z" },
      { status: "PENDING", dueDate: "2026-05-13T15:00:00Z" },
      { status: "PENDING", dueDate: "2026-05-15T15:00:00Z" },
      { status: "PENDING", dueDate: null },
      { status: "COMPLETED", dueDate: "2026-05-10T15:00:00Z" },
    ];

    expect(getTaskSummaryCounts(tasks)).toEqual({
      pending: 2,
      overdue: 2,
      completed: 1,
      total: 5,
    });
  });

  it("does not treat completed or today-due tasks as overdue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    expect(isTaskOverdue({ status: "COMPLETED", dueDate: "2026-05-14T15:00:00Z" })).toBe(false);
    expect(isTaskOverdue({ status: "PENDING", dueDate: "2026-05-15T08:00:00Z" })).toBe(false);
  });
});

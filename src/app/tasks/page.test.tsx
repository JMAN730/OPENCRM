import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksPageClient from "./TasksPageClient";
import { trpc } from "@/app/_trpc/client";
import { useSearchParams } from "next/navigation";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      tasks: {
        getAll: { invalidate: vi.fn() },
        getDueToday: { invalidate: vi.fn() },
      },
    }),
    tasks: {
      create: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      delete: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      getAll: { useQuery: vi.fn() },
      getById: { useQuery: vi.fn() },
      update: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    teams: {
      organizationMembers: { useQuery: vi.fn(() => ({ data: [] })) },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const useTasksQuery = trpc.tasks.getAll.useQuery as unknown as ReturnType<typeof vi.fn>;
const useTaskByIdQuery = trpc.tasks.getById.useQuery as unknown as ReturnType<typeof vi.fn>;
const useSearchParamsMock = useSearchParams as unknown as ReturnType<typeof vi.fn>;

const deepLinkedTask = {
  id: "task-deep",
  title: "Call back on Friday",
  description: "Confirm the service window.",
  dueDate: "2026-06-05T14:00:00.000Z",
  priority: "HIGH",
  status: "PENDING",
  createdAt: "2026-05-16T12:00:00.000Z",
  lead: { id: "lead-1", firstName: "Ava", lastName: "Lane", company: "Acme" },
  user: { id: "user-1", name: "Maya Rivera", image: null },
  assignedTo: { id: "user-1", name: "Maya Rivera", image: null },
};

describe("TasksPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams("taskId=task-deep"));
    useTasksQuery.mockReturnValue({ data: { items: [], nextCursor: null }, isLoading: false });
    useTaskByIdQuery.mockReturnValue({ data: deepLinkedTask });
  });

  it("opens a task detail sidebar from a taskId query parameter", async () => {
    render(<TasksPageClient />);

    expect(useTaskByIdQuery).toHaveBeenCalledWith(
      { taskId: "task-deep" },
      { enabled: true },
    );
    expect(await screen.findByText("Task Details")).toBeInTheDocument();
    expect(screen.getByText("Call back on Friday")).toBeInTheDocument();
    expect(screen.getByText("Confirm the service window.")).toBeInTheDocument();
  });
});

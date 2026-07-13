import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksPage from "./page";
import TasksPageClient from "./TasksPageClient";
import { trpc } from "@/app/_trpc/client";
import { createTRPCContext } from "@/server/trpc";
import { appRouter } from "@/server/api/root";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { useSearchParams } from "next/navigation";

const { prefetchMock, dehydrateMock, dehydratedState } = vi.hoisted(() => {
  const dehydratedState = { queries: [], mutations: [] };
  return {
    prefetchMock: vi.fn(),
    dehydrateMock: vi.fn(() => dehydratedState),
    dehydratedState,
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/server/trpc", () => ({
  createTRPCContext: vi.fn(),
}));

vi.mock("@/server/api/root", () => ({
  appRouter: {},
}));

vi.mock("@trpc/react-query/server", () => ({
  createServerSideHelpers: vi.fn(() => ({
    tasks: { getAll: { prefetch: prefetchMock } },
    dehydrate: dehydrateMock,
  })),
}));

vi.mock("@tanstack/react-query", () => ({
  HydrationBoundary: ({ state, children }: { state: unknown; children: ReactNode }) => (
    <div data-testid="hydration-boundary" data-state={JSON.stringify(state)}>{children}</div>
  ),
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
const createTRPCContextMock = createTRPCContext as unknown as ReturnType<typeof vi.fn>;
const createServerSideHelpersMock = createServerSideHelpers as unknown as ReturnType<typeof vi.fn>;

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

describe("TasksPage (server wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));
    useTasksQuery.mockReturnValue({ data: { items: [], nextCursor: null }, isLoading: false });
    useTaskByIdQuery.mockReturnValue({ data: undefined });
  });

  it("prefetches tasks and dehydrates state when a session exists", async () => {
    const ctx = { session: { user: { id: "user-1" } } };
    createTRPCContextMock.mockResolvedValue(ctx);

    render(await TasksPage());

    expect(createServerSideHelpersMock).toHaveBeenCalledWith({ router: appRouter, ctx });
    expect(prefetchMock).toHaveBeenCalledWith({ limit: 200 });
    expect(dehydrateMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("hydration-boundary")).toHaveAttribute(
      "data-state",
      JSON.stringify(dehydratedState),
    );
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("skips prefetching and passes a null state when there is no session", async () => {
    createTRPCContextMock.mockResolvedValue({ session: null });

    render(await TasksPage());

    expect(createServerSideHelpersMock).not.toHaveBeenCalled();
    expect(prefetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("hydration-boundary")).toHaveAttribute("data-state", "null");
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });
});

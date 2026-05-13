import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TasksList } from "./TasksList";
import { trpc } from "@/app/_trpc/client";

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      tasks: { getAll: { invalidate: vi.fn() } },
    }),
    tasks: {
      getAll: { useQuery: vi.fn() },
      update: { useMutation: vi.fn() },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const useQuery = trpc.tasks.getAll.useQuery as unknown as ReturnType<typeof vi.fn>;
const useMutation = trpc.tasks.update.useMutation as unknown as ReturnType<typeof vi.fn>;

describe("TasksList", () => {
  let mutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mutate = vi.fn();
    useMutation.mockReturnValue({ mutate, isPending: false });
  });

  it("renders the loading state", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<TasksList />);
    expect(screen.getByText(/Loading tasks/i)).toBeInTheDocument();
  });

  it("renders the empty state when there are no tasks", () => {
    useQuery.mockReturnValue({ data: { items: [], nextCursor: null }, isLoading: false });
    render(<TasksList />);
    expect(screen.getByText(/No tasks yet/i)).toBeInTheDocument();
  });

  it("renders tasks with their lead info", () => {
    useQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "t1",
            title: "Call back John",
            completed: false,
            dueDate: null,
            lead: { firstName: "John", lastName: "Doe", company: "Acme" },
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);
    expect(screen.getByText("Call back John")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("calls update mutation when checkbox is toggled", () => {
    useQuery.mockReturnValue({
      data: {
        items: [{ id: "t1", title: "x", completed: false, dueDate: null, lead: null }],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(mutate).toHaveBeenCalledWith({ taskId: "t1", completed: true });
  });

  it("shows an Overdue badge for incomplete tasks past their due date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    useQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "t1",
            title: "Late task",
            completed: false,
            dueDate: yesterday.toISOString(),
            lead: null,
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });

  it("shows a Completed badge for completed tasks (not Overdue, even if past due)", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    useQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "t1",
            title: "Done task",
            completed: true,
            dueDate: yesterday.toISOString(),
            lead: null,
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Overdue/i)).not.toBeInTheDocument();
  });
});

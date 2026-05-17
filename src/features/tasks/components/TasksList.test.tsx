import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trpc } from "@/app/_trpc/client";
import { TasksList } from "./TasksList";

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      tasks: { getAll: { invalidate: vi.fn() } },
    }),
    tasks: {
      delete: { useMutation: vi.fn() },
      getAll: { useQuery: vi.fn() },
      update: { useMutation: vi.fn() },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const useQuery = trpc.tasks.getAll.useQuery as unknown as ReturnType<typeof vi.fn>;
const useUpdateMutation = trpc.tasks.update.useMutation as unknown as ReturnType<typeof vi.fn>;
const useDeleteMutation = trpc.tasks.delete.useMutation as unknown as ReturnType<typeof vi.fn>;

describe("TasksList", () => {
  let updateMutate: ReturnType<typeof vi.fn>;
  let deleteMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateMutate = vi.fn();
    deleteMutate = vi.fn();
    useUpdateMutation.mockReturnValue({ mutate: updateMutate, isPending: false });
    useDeleteMutation.mockReturnValue({ mutate: deleteMutate, isPending: false });
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
            status: "PENDING",
            dueDate: null,
            lead: { id: "lead-1", firstName: "John", lastName: "Doe", company: "Acme" },
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
        items: [{ id: "t1", title: "x", status: "PENDING", dueDate: null, lead: null }],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(updateMutate).toHaveBeenCalledWith({ taskId: "t1", status: "COMPLETED" });
  });

  it("opens the edit dialog and saves title/date changes", () => {
    useQuery.mockReturnValue({
      data: {
        items: [{ id: "t1", title: "Original", status: "PENDING", dueDate: null, lead: null }],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);

    fireEvent.click(screen.getByRole("button", { name: "Open actions for Original" }));
    fireEvent.click(screen.getByText("Edit task"));

    fireEvent.change(screen.getByDisplayValue("Original"), { target: { value: "Updated title" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByText("Save changes"));

    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "t1",
      title: "Updated title",
      dueDate: expect.stringMatching(/^2026-06-01/),
    }));
  });

  it("calls delete mutation from the actions menu", () => {
    useQuery.mockReturnValue({
      data: {
        items: [{ id: "t1", title: "Cleanup", status: "PENDING", dueDate: null, lead: null }],
        nextCursor: null,
      },
      isLoading: false,
    });

    render(<TasksList />);

    fireEvent.click(screen.getByRole("button", { name: "Open actions for Cleanup" }));
    fireEvent.click(screen.getByText("Delete task"));

    expect(deleteMutate).toHaveBeenCalledWith({ taskId: "t1" });
  });

  it("shows an Overdue badge for incomplete tasks past their due date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    useQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "t1",
            title: "Late task",
            status: "PENDING",
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

  it("shows a Completed badge for completed tasks", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    useQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "t1",
            title: "Done task",
            status: "COMPLETED",
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

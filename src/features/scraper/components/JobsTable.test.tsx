import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobsTable } from "./JobsTable";

const stopMutate = vi.fn();
const delMutate = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    scraper: {
      stop: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => {
            stopMutate(args);
            onSuccess();
          },
          isPending: false,
        }),
      },
      delete: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => {
            delMutate(args);
            onSuccess();
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "COMPLETED" as const,
    locations: ["Tampa, FL", "Orlando, FL"],
    totalScraped: 42,
    importedCount: 38,
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: "2024-01-01T10:30:00Z",
    createdAt: "2024-01-01T09:55:00Z",
    error: null,
    ...overrides,
  };
}

describe("JobsTable", () => {
  const onOpenJob = vi.fn();
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("shows a loading message while jobs are loading", () => {
    render(<JobsTable jobs={[]} isLoading onOpenJob={onOpenJob} onChanged={onChanged} />);
    expect(screen.getByText(/Loading jobs/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no jobs", () => {
    render(<JobsTable jobs={[]} isLoading={false} onOpenJob={onOpenJob} onChanged={onChanged} />);
    expect(screen.getByText(/No scraper jobs yet/i)).toBeInTheDocument();
  });

  it("renders a job row with status, locations, and counts", () => {
    render(
      <JobsTable
        jobs={[makeJob()]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText(/Tampa, FL/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
  });

  it("shows the Stop button for RUNNING jobs and not for others", () => {
    render(
      <JobsTable
        jobs={[makeJob({ status: "RUNNING" })]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByRole("button", { name: /Stop/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/i })).not.toBeInTheDocument();
  });

  it("shows the Delete button for non-RUNNING jobs and not the Stop button", () => {
    render(
      <JobsTable
        jobs={[makeJob({ status: "FAILED" })]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByRole("button", { name: "" })).toBeInTheDocument(); // delete icon-only button
    expect(screen.queryByRole("button", { name: /Stop/i })).not.toBeInTheDocument();
  });

  it("calls onOpenJob when the View button is clicked", () => {
    render(
      <JobsTable
        jobs={[makeJob()]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /View/i }));
    expect(onOpenJob).toHaveBeenCalledWith("job-1");
  });

  it("calls stop mutation and onChanged when Stop is clicked", async () => {
    render(
      <JobsTable
        jobs={[makeJob({ status: "RUNNING" })]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    await waitFor(() => {
      expect(stopMutate).toHaveBeenCalledWith({ id: "job-1" });
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("calls delete mutation and onChanged when Delete is confirmed", async () => {
    render(
      <JobsTable
        jobs={[makeJob({ status: "COMPLETED" })]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    const deleteBtn = screen.getAllByRole("button").find((b) => !b.textContent?.match(/View/));
    fireEvent.click(deleteBtn!);

    await waitFor(() => {
      expect(delMutate).toHaveBeenCalledWith({ id: "job-1" });
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("does not call delete when the confirm dialog is dismissed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));

    render(
      <JobsTable
        jobs={[makeJob({ status: "COMPLETED" })]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    const deleteBtn = screen.getAllByRole("button").find((b) => !b.textContent?.match(/View/));
    fireEvent.click(deleteBtn!);

    expect(delMutate).not.toHaveBeenCalled();
  });

  it("renders multiple jobs", () => {
    render(
      <JobsTable
        jobs={[makeJob({ id: "job-1", status: "COMPLETED" }), makeJob({ id: "job-2", status: "FAILED", locations: ["Miami, FL"] })]}
        isLoading={false}
        onOpenJob={onOpenJob}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
  });
});

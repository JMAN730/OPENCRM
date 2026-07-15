import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScraperPanel } from "./ScraperPanel";

// The polling seam: ScraperPanel passes a refetchInterval to the job-list
// query. These tests run the component against the real react-query runtime
// (fake timers) and count actual fetches — the observable network behavior.
const harness = vi.hoisted(() => ({
  jobs: [] as Array<{ id: string; status: string }>,
  listFetchCount: 0,
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => {
      const queryClient = useQueryClient();
      return {
        scraper: {
          list: {
            invalidate: () => queryClient.invalidateQueries({ queryKey: ["scraper-list"] }),
          },
        },
        leads: {
          getAll: { invalidate: vi.fn() },
        },
      };
    },
    scraper: {
      config: {
        useQuery: () => ({
          data: { enabled: true, categories: [], maxLocations: 50, maxRecords: 200 },
          isLoading: false,
        }),
      },
      list: {
        useQuery: (_input: unknown, opts?: Record<string, unknown>) =>
          useQuery({
            queryKey: ["scraper-list"],
            queryFn: async () => {
              harness.listFetchCount += 1;
              return harness.jobs;
            },
            ...opts,
          }),
      },
    },
  },
}));

vi.mock("./StartJobForm", () => ({
  StartJobForm: ({ onStarted }: { onStarted: () => void }) => (
    <button onClick={onStarted}>Start job (stub)</button>
  ),
}));

vi.mock("./ScheduledScrapePanel", () => ({
  ScheduledScrapePanel: () => <div>Scheduled panel (stub)</div>,
}));

vi.mock("./JobsTable", () => ({
  JobsTable: ({ jobs }: { jobs: Array<{ id: string }> }) => (
    <div>Jobs table: {jobs.length} jobs</div>
  ),
}));

vi.mock("./JobDetailDialog", () => ({
  JobDetailDialog: () => <div>Job detail (stub)</div>,
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScraperPanel />
    </QueryClientProvider>,
  );
}

async function flushInitialFetch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("ScraperPanel job-list polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.jobs = [];
    harness.listFetchCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll when all jobs are in terminal states", async () => {
    harness.jobs = [
      { id: "job-1", status: "COMPLETED" },
      { id: "job-2", status: "FAILED" },
      { id: "job-3", status: "STOPPED" },
    ];

    renderPanel();
    await flushInitialFetch();
    expect(harness.listFetchCount).toBe(1);
    expect(screen.getByText("Jobs table: 3 jobs")).toBeInTheDocument();

    // The old idle interval was 10s — well past that, still no refetch.
    await advance(35_000);
    expect(harness.listFetchCount).toBe(1);
  });

  it("keeps polling at the fast interval while a job is RUNNING", async () => {
    harness.jobs = [
      { id: "job-1", status: "RUNNING" },
      { id: "job-2", status: "COMPLETED" },
    ];

    renderPanel();
    await flushInitialFetch();
    expect(harness.listFetchCount).toBe(1);

    await advance(2_000);
    expect(harness.listFetchCount).toBe(2);

    await advance(2_000);
    expect(harness.listFetchCount).toBe(3);
  });

  it("keeps polling while a job is PENDING", async () => {
    harness.jobs = [{ id: "job-1", status: "PENDING" }];

    renderPanel();
    await flushInitialFetch();
    expect(harness.listFetchCount).toBe(1);

    await advance(2_000);
    expect(harness.listFetchCount).toBe(2);
  });

  it("resumes polling when a job starts after an idle stretch", async () => {
    harness.jobs = [{ id: "job-1", status: "COMPLETED" }];

    renderPanel();
    await flushInitialFetch();
    expect(harness.listFetchCount).toBe(1);

    await advance(20_000);
    expect(harness.listFetchCount).toBe(1);

    // Starting a job invalidates the list (mutation flow), which refetches
    // and picks up the RUNNING job — polling resumes without manual refresh.
    harness.jobs = [
      { id: "job-1", status: "COMPLETED" },
      { id: "job-2", status: "RUNNING" },
    ];
    act(() => {
      screen.getByText("Start job (stub)").click();
    });
    await flushInitialFetch();
    expect(harness.listFetchCount).toBe(2);

    await advance(2_000);
    expect(harness.listFetchCount).toBe(3);
  });
});

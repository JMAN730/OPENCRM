import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadModal } from "./LeadModal";

const invalidateLeads = vi.fn();
const invalidateNotes = vi.fn();
const invalidateActivities = vi.fn();
const invalidateTasks = vi.fn();
const invalidateLeadTasks = vi.fn();
const outcomeMutate = vi.fn();
const tempMutate = vi.fn();
const assignMutate = vi.fn();
const createNoteMutate = vi.fn();
const createTaskMutate = vi.fn();
const deleteNoteMutate = vi.fn();
const toggleStarMutate = vi.fn();
const deleteLeadMutate = vi.fn();
let createTaskOptions: { onSuccess?: () => void; onError?: (error: Error) => void } | undefined;
let leadTasksMock: Array<{ id: string; title: string; dueDate: string | Date | null; status: string }> = [];

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: "user-1",
        role: "ADMIN",
        name: "Maya Rivera",
        email: "user@example.com",
      },
    },
  })),
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      leads: {
        getAll: { invalidate: invalidateLeads },
        getNotes: { invalidate: invalidateNotes },
        getActivities: { invalidate: invalidateActivities },
        listOrgTags: { invalidate: vi.fn() },
        customOutcomes: { list: { invalidate: vi.fn() } },
      },
      tasks: {
        getAll: { invalidate: invalidateTasks },
        getAllForLead: { invalidate: invalidateLeadTasks },
      },
    }),
    leads: {
      getNotes: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      getActivities: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      updateCallOutcome: {
        useMutation: vi.fn(() => ({ mutate: outcomeMutate, isPending: false })),
      },
      setDisposition: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      updateTemperatureOverride: {
        useMutation: vi.fn(() => ({ mutate: tempMutate, isPending: false })),
      },
      updateValue: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      listOrgTags: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      qualify: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false, data: undefined })),
      },
      addTagToLead: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      removeTagFromLead: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      createTag: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      assign: {
        useMutation: vi.fn(() => ({ mutate: assignMutate, isPending: false })),
      },
      createNote: {
        useMutation: vi.fn(() => ({ mutate: createNoteMutate, isPending: false })),
      },
      deleteNote: {
        useMutation: vi.fn(() => ({ mutate: deleteNoteMutate, isPending: false })),
      },
      toggleStar: {
        useMutation: vi.fn(() => ({ mutate: toggleStarMutate, isPending: false })),
      },
      delete: {
        useMutation: vi.fn(() => ({ mutate: deleteLeadMutate, isPending: false })),
      },
      generateQualification: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      customOutcomes: {
        list: { useQuery: vi.fn(() => ({ data: [] })) },
        create: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      },
    },
    tasks: {
      getAllForLead: {
        useQuery: vi.fn(() => ({ data: leadTasksMock })),
      },
      create: {
        useMutation: vi.fn((options) => {
          createTaskOptions = options;
          return { mutate: createTaskMutate, isPending: false };
        }),
      },
    },
    teams: {
      myTeam: {
        useQuery: vi.fn(() => ({ data: { users: [] } })),
      },
      organizationMembers: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
    },
    scoring: {
      getRules: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
    },
    websites: {
      generate: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      update: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("LeadModal", () => {
  const lead = {
    id: "lead-1",
    firstName: "Ava",
    lastName: "Lane",
    email: "ava@example.com",
    phone: "5551234567",
    company: "Acme",
    city: "Tampa",
    state: "FL",
    website: "acme.com",
    rating: 4.6,
    reviewCount: 128,
    status: "NOT_CONTACTED",
    callOutcome: "NOT_CONTACTED",
    callNotes: null,
    source: "GoogleMaps",
    createdAt: new Date().toISOString(),
    assignedToId: null,
    assignedTo: null,
    temperatureOverride: null,
    starred: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createTaskOptions = undefined;
    leadTasksMock = [];
  });

  it("renders website as a clickable external link", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    const websiteLink = screen.getByRole("link", { name: "acme.com" });
    expect(websiteLink).toHaveAttribute("href", "https://acme.com");
  });

  it("shows reviews next to lead score context", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getAllByText(/128 reviews/i).length).toBeGreaterThan(0);
  });

  it("shows the company and source context", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByText("Acme · GoogleMaps")).toBeInTheDocument();
  });

  it("allows setting a manual temperature override", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Temperature override"), {
      target: { value: "HOT" },
    });

    expect(tempMutate).toHaveBeenCalledWith({
      id: "lead-1",
      temperatureOverride: "HOT",
    });
  });

  it("preserves call outcome mutation wiring", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /log outcome/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /connected/i }));

    expect(outcomeMutate).toHaveBeenCalledWith({
      id: "lead-1",
      callOutcome: "ANSWERED",
    });
  });

  it("renders a task button in the lead action row", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Task" })).toBeInTheDocument();
  });

  it("shows the earliest open task due date as a task page link", () => {
    leadTasksMock = [
      {
        id: "task-later",
        title: "Later follow up",
        dueDate: "2026-06-10T12:00:00.000Z",
        status: "PENDING",
      },
      {
        id: "task-next",
        title: "Next follow up",
        dueDate: "2026-06-01T12:00:00.000Z",
        status: "IN_PROGRESS",
      },
    ];

    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByText("Next task")).toBeInTheDocument();
    const taskLink = screen.getByRole("link", { name: "Jun 1, 2026" });
    expect(taskLink).toHaveAttribute("href", "/tasks?taskId=task-next");
    expect(taskLink).toHaveStyle({ color: "#2563eb" });
  });

  it("ignores completed tasks when showing the next task due date", () => {
    leadTasksMock = [
      {
        id: "task-complete",
        title: "Already done",
        dueDate: "2026-06-01T12:00:00.000Z",
        status: "COMPLETED",
      },
      {
        id: "task-open",
        title: "Open follow up",
        dueDate: "2026-06-05T12:00:00.000Z",
        status: "PENDING",
      },
    ];

    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "Jun 1, 2026" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jun 5, 2026" })).toHaveAttribute(
      "href",
      "/tasks?taskId=task-open",
    );
  });

  it("does not show a next task row when there are no open dated tasks", () => {
    leadTasksMock = [
      {
        id: "task-complete",
        title: "Already done",
        dueDate: "2026-06-01T12:00:00.000Z",
        status: "COMPLETED",
      },
      {
        id: "task-undated",
        title: "Needs scheduling",
        dueDate: null,
        status: "PENDING",
      },
    ];

    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.queryByText("Next task")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /2026/i })).not.toBeInTheDocument();
  });

  it("opens the create task dialog with title, due date, and priority fields", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Task" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toHaveValue("MEDIUM");
  });

  it("creates a task associated with the current lead", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Task" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Call back owner" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(createTaskMutate).toHaveBeenCalledWith({
      leadId: "lead-1",
      title: "Call back owner",
      dueDate: new Date(2026, 5, 1).toISOString(),
      priority: "HIGH",
    });
  });

  it("rejects empty task titles before calling the mutation", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Task" }));
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(createTaskMutate).not.toHaveBeenCalled();
  });

  it("refreshes task and lead activity caches after task creation succeeds", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    createTaskOptions?.onSuccess?.();

    expect(invalidateTasks).toHaveBeenCalled();
    expect(invalidateLeadTasks).toHaveBeenCalledWith({ leadId: "lead-1" });
    expect(invalidateActivities).toHaveBeenCalledWith({ leadId: "lead-1" });
  });
});

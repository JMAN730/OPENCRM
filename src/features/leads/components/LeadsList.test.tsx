import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadsList } from "./LeadsList";

const mockReplace = vi.fn();
const invalidateLeads = vi.fn();
const invalidateDueToday = vi.fn();
const invalidateOverdue = vi.fn();
const invalidateUpcomingFollowUps = vi.fn();
const createLeadMutate = vi.fn();
const deleteLeadMutate = vi.fn();
const assignLeadMutate = vi.fn();
const bulkDeleteMutateAsync = vi.fn();

let searchParamNew: string | null = null;
let leadQueryCalls: Array<{ search?: string; limit: number; cursor?: string }> = [];
let leadPages: Record<string, { items: Array<Record<string, unknown>>; nextCursor: string | null }> =
  {};
let searchParamView: string | null = null;
let leadQueryState = { isLoading: false, isFetching: false };
let customOutcomesState: Array<{ id: string; label: string }> = [];
let dueTodayState: { data: Array<Record<string, unknown>>; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
let overdueState: { data: Array<Record<string, unknown>>; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
let upcomingFollowUpsState: {
  data: Array<Record<string, unknown>>;
  isLoading: boolean;
  isError: boolean;
} = {
  data: [],
  isLoading: false,
  isError: false,
};
let orgMembersState: Array<Record<string, unknown>> = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "new") return searchParamNew;
      if (key === "view") return searchParamView;
      return null;
    },
    toString: () => {
      const params = new URLSearchParams();
      if (searchParamNew !== null) params.set("new", searchParamNew);
      if (searchParamView !== null) params.set("view", searchParamView);
      return params.toString();
    },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Maya Rivera",
        role: "ADMIN",
        organizationId: "org-1",
      },
    },
    status: "authenticated",
  })),
}));

vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

vi.mock("./ImportLeadsDialog", () => ({
  ImportLeadsDialog: ({ onImported }: { onImported: () => void }) => (
    <button onClick={onImported}>Import</button>
  ),
}));

vi.mock("./lead-list/AddLeadForm", () => ({
  AddLeadForm: ({
    onCancel,
    onSubmit,
  }: {
    onCancel: () => void;
    onSubmit: (data: Record<string, string>) => void;
  }) => (
    <div>
      <div>Create new lead modal</div>
      <button
        onClick={() =>
          onSubmit({
            firstName: "Nina",
            lastName: "North",
            company: "Northwind",
            email: "nina@example.com",
            phone: "5551112222",
            city: "Tampa",
            state: "FL",
          })
        }
      >
        Submit lead
      </button>
      <button onClick={onCancel}>Cancel lead</button>
    </div>
  ),
}));

vi.mock("./lead-list/LeadModal", () => ({
  LeadModal: ({
    lead,
    onClose,
  }: {
    lead: { id: string };
    onClose: () => void;
  }) => (
    <div>
      <div>Lead modal for {lead.id}</div>
      <input aria-label="Lead modal text input" />
      <textarea aria-label="Lead modal notes" />
      <select aria-label="Lead modal select" defaultValue="one">
        <option value="one">One</option>
        <option value="two">Two</option>
      </select>
      <div aria-label="Lead modal rich text" contentEditable role="textbox" />
      <button onClick={onClose}>Close lead modal</button>
    </div>
  ),
}));

vi.mock("./lead-list/LeadBulkActionBar", () => ({
  LeadBulkActionBar: ({
    selectedCount,
    onAssign,
    onBulkDelete,
    onClear,
  }: {
    selectedCount: number;
    onAssign: (assigneeId: string | null) => void;
    onBulkDelete: () => void;
    onClear: () => void;
  }) => (
    <div>
      <div>{selectedCount} selected</div>
      <button onClick={() => onAssign("user-2")}>Assign selected</button>
      <button onClick={onBulkDelete}>Delete selected leads</button>
      <button onClick={onClear}>Clear selected leads</button>
    </div>
  ),
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      leads: {
        getAll: { invalidate: invalidateLeads },
      },
      tasks: {
        getDueToday: { invalidate: invalidateDueToday },
        getOverdue: { invalidate: invalidateOverdue },
        getUpcomingFollowUps: { invalidate: invalidateUpcomingFollowUps },
      },
    }),
    leads: {
      getAll: {
        useQuery: vi.fn((input: { search?: string; limit: number; cursor?: string }) => {
          leadQueryCalls.push(input);
          const page = leadPages[input.cursor ?? "root"] ?? { items: [], nextCursor: null };
          const search = input.search?.toLowerCase().trim();
          const items = !search
            ? page.items
            : page.items.filter((lead) => JSON.stringify(lead).toLowerCase().includes(search));

          return {
            data: { items, nextCursor: page.nextCursor },
            isLoading: leadQueryState.isLoading,
            isFetching: leadQueryState.isFetching,
          };
        }),
      },
      getById: {
        useQuery: vi.fn(() => ({ data: undefined })),
      },
      create: {
        useMutation: vi.fn(() => ({ mutate: createLeadMutate, isPending: false })),
      },
      delete: {
        useMutation: vi.fn(() => ({ mutate: deleteLeadMutate, isPending: false })),
      },
      assign: {
        useMutation: vi.fn(() => ({ mutate: assignLeadMutate, isPending: false })),
      },
      bulkDelete: {
        useMutation: vi.fn(() => ({ mutateAsync: bulkDeleteMutateAsync, isPending: false })),
      },
      export: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      bulkSetTemperature: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      listOrgTags: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      customOutcomes: {
        list: { useQuery: vi.fn(() => ({ data: customOutcomesState })) },
      },
    },
    tasks: {
      getDueToday: {
        useQuery: vi.fn(() => dueTodayState),
      },
      getOverdue: {
        useQuery: vi.fn(() => overdueState),
      },
      getUpcomingFollowUps: {
        useQuery: vi.fn(() => upcomingFollowUpsState),
      },
    },
    teams: {
      myTeam: {
        useQuery: vi.fn(() => ({ data: { users: [] } })),
      },
      organizationMembers: {
        useQuery: vi.fn(() => ({ data: orgMembersState })),
      },
    },
    scoring: {
      getRules: {
        useQuery: vi.fn(() => ({ data: [] })),
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

function makeLead(overrides: Record<string, unknown>) {
  return {
    id: "lead-default",
    firstName: "Alex",
    lastName: "Stone",
    email: "alex@example.com",
    phone: "5551231234",
    company: "Acme Corp",
    city: "Tampa",
    state: "FL",
    website: null,
    rating: 4.8,
    reviewCount: 120,
    status: "NOT_CONTACTED",
    temperatureOverride: null,
    source: "GoogleMaps",
    callOutcome: "NOT_CONTACTED",
    callNotes: null,
    createdAt: "2026-05-14T13:00:00.000Z",
    assignedToId: "user-1",
    assignedTo: {
      id: "user-1",
      name: "Maya Rivera",
      email: "user@example.com",
      image: null,
    },
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown>) {
  return {
    id: "task-1",
    title: "Follow up",
    description: null,
    leadId: "lead-1",
    dueDate: "2026-05-14T15:00:00.000Z",
    priority: "MEDIUM",
    status: "PENDING",
    completed: false,
    assignedToId: "user-1",
    userId: "user-1",
    createdAt: "2026-05-14T12:00:00.000Z",
    lead: {
      id: "lead-1",
      firstName: "Alex",
      lastName: "Stone",
      company: "Acme Corp",
    },
    assignedTo: {
      id: "user-1",
      name: "Maya Rivera",
    },
    ...overrides,
  };
}

function getAllLeadsSection() {
  return screen.getByRole("button", { name: /select visible/i }).closest("section") as HTMLElement;
}

function getQuickFilterChip(label: "All" | "Hot" | "Due today" | "Mine") {
  const container = document.querySelector(".focus-filters");
  if (!(container instanceof HTMLElement)) {
    throw new Error("Quick filter container not found");
  }
  return within(container).getByRole("button", { name: new RegExp(`^${label}`, "i") });
}

function getStageChip(label: string) {
  const container = document.querySelector(".focus-chip-row");
  if (!(container instanceof HTMLElement)) {
    throw new Error("Stage chip container not found");
  }
  return within(container).getByRole("button", { name: new RegExp(`^${label}`, "i") });
}

describe("LeadsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamNew = null;
    searchParamView = null;
    leadQueryCalls = [];
    leadQueryState = { isLoading: false, isFetching: false };
    customOutcomesState = [];
    orgMembersState = [
      { id: "user-1", name: "Maya Rivera", email: "user@example.com", image: null },
      { id: "user-2", name: "Theo King", email: "theo@example.com", image: null },
    ];
    leadPages = {
      root: {
        items: [
          makeLead({
            id: "lead-1",
            firstName: "Alex",
            lastName: "Stone",
            company: "Acme Corp",
            assignedToId: "user-1",
            rating: 5,
          }),
          makeLead({
            id: "lead-2",
            firstName: "Blair",
            lastName: "Hart",
            company: "Beta Health",
            rating: 3.6,
            reviewCount: 12,
            status: "CONNECTED",
            assignedToId: "user-2",
            assignedTo: {
              id: "user-2",
              name: "Theo King",
              email: "theo@example.com",
              image: null,
            },
            createdAt: "2026-05-14T09:00:00.000Z",
          }),
          makeLead({
            id: "lead-3",
            firstName: "Casey",
            lastName: "Lane",
            company: "Gamma Labs",
            rating: 2.9,
            reviewCount: 3,
            status: "NO_ANSWER",
            assignedToId: "user-1",
            createdAt: "2026-05-13T09:00:00.000Z",
          }),
        ],
        nextCursor: null,
      },
    };
    dueTodayState = {
      data: [
        makeTask({
          id: "task-due",
          leadId: "lead-2",
          lead: {
            id: "lead-2",
            firstName: "Blair",
            lastName: "Hart",
            company: "Beta Health",
          },
        }),
      ],
      isLoading: false,
      isError: false,
    };
    overdueState = {
      data: [
        makeTask({
          id: "task-overdue",
          leadId: "lead-3",
          dueDate: "2026-05-13T13:00:00.000Z",
          lead: {
            id: "lead-3",
            firstName: "Casey",
            lastName: "Lane",
            company: "Gamma Labs",
          },
        }),
      ],
      isLoading: false,
      isError: false,
    };
    upcomingFollowUpsState = {
      data: [],
      isLoading: false,
      isError: false,
    };
    bulkDeleteMutateAsync.mockResolvedValue({ count: 1 });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("opens the add lead modal from the ?new=1 route flag", () => {
    searchParamNew = "1";

    render(<LeadsList />);

    expect(screen.getByText("Create new lead modal")).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/leads");
  });

  it("preserves the selected layout when clearing the ?new=1 route flag", () => {
    searchParamNew = "1";
    searchParamView = "classic";

    render(<LeadsList />);

    expect(mockReplace).toHaveBeenCalledWith("/leads?view=classic");
  });

  it("renders the focus layout and filters to due-today leads", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    expect(screen.getByRole("heading", { name: "Leads - Focus" })).toBeInTheDocument();
    expect(screen.getByText(/Good morning|Good afternoon|Good evening/)).toBeInTheDocument();

    fireEvent.click(getQuickFilterChip("Due today"));

    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Beta Health")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Acme Corp")).not.toBeInTheDocument();
    });
  });

  it("renders the classic table layout from the view query param and can switch back", () => {
    searchParamView = "classic";

    render(<LeadsList />);

    expect(screen.getByRole("heading", { name: "Leads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Leads - Focus" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search leads, companies, notes...")).toBeInTheDocument();

    mockReplace.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Focus view" }));

    expect(mockReplace).toHaveBeenCalledWith("/leads");
  });

  it("switches from focus view to the classic layout route", () => {
    render(<LeadsList />);

    fireEvent.click(screen.getByRole("button", { name: "Classic view" }));

    expect(mockReplace).toHaveBeenCalledWith("/leads?view=classic");
  });

  it("supports hot and mine quick filters from the focus header", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.click(getQuickFilterChip("Hot"));
    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Acme Corp")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Beta Health")).not.toBeInTheDocument();
    });

    fireEvent.click(getQuickFilterChip("Mine"));
    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Acme Corp")).toBeInTheDocument();
      expect(within(allLeadsSection).getByText("Gamma Labs")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Beta Health")).not.toBeInTheDocument();
    });
  });

  it("preserves stage, owner, and score filtering from the management section", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.click(getStageChip("Connected"));
    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Beta Health")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Acme Corp")).not.toBeInTheDocument();
    });

    fireEvent.click(getStageChip("All"));
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.click(screen.getByText("Theo King", { selector: "label" }));
    fireEvent.change(screen.getByPlaceholderText("Min"), { target: { value: "60" } });

    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Beta Health")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Gamma Labs")).not.toBeInTheDocument();
    });
  });

  it("keeps custom outcomes out of generic connected stage counts and filters", async () => {
    customOutcomesState = [{ id: "custom-1", label: "Booked demo" }];
    leadPages.root.items = [
      makeLead({
        id: "lead-connected",
        company: "Connected Co",
        status: "CONNECTED",
        callOutcome: "ANSWERED",
      }),
      makeLead({
        id: "lead-custom",
        company: "Custom Co",
        status: "CONNECTED",
        callOutcome: "CUSTOM",
        customOutcomeId: "custom-1",
        customOutcome: { id: "custom-1", label: "Booked demo" },
      }),
    ];

    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    expect(getStageChip("Connected")).toHaveTextContent("1");
    expect(getStageChip("Booked demo")).toHaveTextContent("1");

    fireEvent.click(getStageChip("Connected"));
    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Connected Co")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Custom Co")).not.toBeInTheDocument();
    });

    fireEvent.click(getStageChip("Connected"));
    fireEvent.click(getStageChip("Booked demo"));
    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Custom Co")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Connected Co")).not.toBeInTheDocument();
    });
  });

  it("filters favorites to only starred leads from the focus sort control", async () => {
    leadPages.root.items = [
      makeLead({
        id: "lead-starred",
        company: "Starred Studio",
        starred: true,
        createdAt: "2026-05-14T13:00:00.000Z",
      }),
      makeLead({
        id: "lead-unstarred",
        company: "Unstarred Works",
        starred: false,
        createdAt: "2026-05-14T12:00:00.000Z",
      }),
      makeLead({
        id: "lead-null-starred",
        company: "Null Favorite Co",
        starred: null,
        createdAt: "2026-05-14T11:00:00.000Z",
      }),
      makeLead({
        id: "lead-missing-starred",
        company: "Missing Favorite LLC",
        createdAt: "2026-05-14T10:00:00.000Z",
      }),
    ];

    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.change(screen.getByLabelText("Sort leads by"), {
      target: { value: "starred" },
    });

    await waitFor(() => {
      expect(within(allLeadsSection).getByText("Starred Studio")).toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Unstarred Works")).not.toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Null Favorite Co")).not.toBeInTheDocument();
      expect(within(allLeadsSection).queryByText("Missing Favorite LLC")).not.toBeInTheDocument();
    });
  });

  it("supports column toggling, lead actions, and opening a lead from the card list", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByText("Owner", { selector: "label" }));
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));

    expect(screen.queryByText(/^Owner$/)).not.toBeInTheDocument();

    const callLink = within(allLeadsSection).getAllByRole("link", { name: /^Call$/i })[0];
    const emailLink = within(allLeadsSection).getAllByRole("link", { name: /^Email$/i })[0];
    expect(callLink).toHaveAttribute("href", "tel:5551231234");
    expect(emailLink).toHaveAttribute("href", "mailto:alex@example.com");

    fireEvent.click(within(allLeadsSection).getAllByTitle("Delete")[0]!);
    expect(deleteLeadMutate).toHaveBeenCalledWith({ id: "lead-1" });

    fireEvent.click(within(allLeadsSection).getByText("Acme Corp"));
    await waitFor(() => {
      expect(screen.getByText("Lead modal for lead-1")).toBeInTheDocument();
    });
  });

  it("supports j and k lead navigation from non-editable modal context", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.click(within(allLeadsSection).getByText("Acme Corp"));
    await waitFor(() => {
      expect(screen.getByText("Lead modal for lead-1")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => {
      expect(screen.getByText("Lead modal for lead-2")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => {
      expect(screen.getByText("Lead modal for lead-1")).toBeInTheDocument();
    });
  });

  it("does not use j or k as lead navigation while typing in modal inputs", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.click(within(allLeadsSection).getByText("Beta Health"));
    await waitFor(() => {
      expect(screen.getByText("Lead modal for lead-2")).toBeInTheDocument();
    });

    const textInput = screen.getByLabelText("Lead modal text input");
    fireEvent.keyDown(textInput, { key: "j" });
    fireEvent.keyDown(textInput, { key: "k" });

    expect(screen.getByText("Lead modal for lead-2")).toBeInTheDocument();
  });

  it("does not use arrow keys as lead navigation while typing in editable modal controls", async () => {
    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    fireEvent.click(within(allLeadsSection).getByText("Beta Health"));
    await waitFor(() => {
      expect(screen.getByText("Lead modal for lead-2")).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByLabelText("Lead modal notes"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByLabelText("Lead modal select"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByLabelText("Lead modal rich text"), { key: "ArrowDown" });

    expect(screen.getByText("Lead modal for lead-2")).toBeInTheDocument();
  });

  it("preserves pagination and search wiring against the current useQuery shape", async () => {
    leadPages = {
      root: {
        items: [makeLead({ id: "lead-1", company: "Acme Corp" })],
        nextCursor: "cursor-2",
      },
      "cursor-2": {
        items: [makeLead({ id: "lead-2", company: "Bright Labs" })],
        nextCursor: null,
      },
    };

    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    expect(within(allLeadsSection).getByText("Acme Corp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(within(allLeadsSection).getByText("Bright Labs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(within(allLeadsSection).getByText("Acme Corp")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search leads..."), {
      target: { value: "Acme" },
    });

    await waitFor(() => {
      expect(leadQueryCalls.at(-1)?.search).toBe("Acme");
    });
  });

  it("shows bulk actions and preserves the bulk delete flow", async () => {
    render(<LeadsList />);

    fireEvent.click(screen.getByRole("button", { name: /select visible/i }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete selected leads/i }));

    await waitFor(() => {
      expect(bulkDeleteMutateAsync).toHaveBeenCalled();
      expect(invalidateLeads).toHaveBeenCalled();
      expect(invalidateDueToday).toHaveBeenCalled();
      expect(invalidateOverdue).toHaveBeenCalled();
    });
  });

  it("renders a focus fallback when task signals fail without breaking the lead list", () => {
    dueTodayState = { data: [], isLoading: false, isError: true };
    overdueState = { data: [], isLoading: false, isError: true };

    render(<LeadsList />);
    const allLeadsSection = getAllLeadsSection();

    expect(screen.getByText(/Focus signals are unavailable right now/i)).toBeInTheDocument();
    expect(within(allLeadsSection).getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All leads" })).toBeInTheDocument();
  });
});

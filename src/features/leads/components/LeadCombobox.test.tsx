import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeadCombobox, leadDisplayName } from "./LeadCombobox";

// ── pure function tests ────────────────────────────────────────────────────

describe("leadDisplayName", () => {
  it("returns company when present", () => {
    expect(leadDisplayName({ company: "Acme Corp", firstName: "John", lastName: "Doe" })).toBe(
      "Acme Corp",
    );
  });

  it("falls back to full name when company is absent", () => {
    expect(leadDisplayName({ company: "", firstName: "John", lastName: "Doe" })).toBe("John Doe");
  });

  it("uses only first name when last name is absent", () => {
    expect(leadDisplayName({ company: "", firstName: "John", lastName: "" })).toBe("John");
  });

  it("returns 'Unnamed' when all fields are empty", () => {
    expect(leadDisplayName({ company: "", firstName: "", lastName: "" })).toBe("Unnamed");
  });

  it("returns 'Unnamed' when all fields are null/undefined", () => {
    expect(leadDisplayName({ company: null, firstName: null, lastName: null } as never)).toBe(
      "Unnamed",
    );
  });
});

// ── component tests ────────────────────────────────────────────────────────

const mockGetAll = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    leads: {
      getAll: {
        useQuery: (input: { search?: string }, opts: { enabled: boolean }) => {
          if (!opts.enabled) return { data: undefined };
          return mockGetAll(input);
        },
      },
    },
  },
}));

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    company: "Acme Corp",
    firstName: "John",
    lastName: "Doe",
    email: "john@acme.com",
    phone: null,
    ...overrides,
  };
}

describe("LeadCombobox", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockReturnValue({ data: { items: [makeLead()] } });
  });

  it("renders the search input by default", () => {
    render(<LeadCombobox value="" onChange={onChange} />);
    expect(screen.getByPlaceholderText(/Search leads/i)).toBeInTheDocument();
  });

  it("shows results when user types in the search box", async () => {
    render(<LeadCombobox value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Search leads/i);

    fireEvent.change(input, { target: { value: "Acme" } });

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });
  });

  it("calls onChange with the selected lead's id and display name", async () => {
    render(<LeadCombobox value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Search leads/i);
    fireEvent.change(input, { target: { value: "Acme" } });

    await waitFor(() => screen.getByText("Acme Corp"));
    fireEvent.click(screen.getByText("Acme Corp"));

    expect(onChange).toHaveBeenCalledWith("lead-1", "Acme Corp", expect.objectContaining({ id: "lead-1" }));
  });

  it("displays the selected lead name chip when value is set", () => {
    render(<LeadCombobox value="lead-1" onChange={onChange} />);
    // When value is set and dropdown is closed, the component shows a linked chip
    // The displayName starts empty until a lead is selected interactively,
    // so a non-empty value with no prior selection shows the chip area.
    expect(screen.queryByPlaceholderText(/Search leads/i)).not.toBeInTheDocument();
  });

  it("calls onChange with empty strings when the clear button is clicked", () => {
    render(<LeadCombobox value="lead-1" onChange={onChange} />);
    const clearBtn = screen.getByRole("button");
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("", "");
  });

  it("shows 'No leads found' when search returns empty results", async () => {
    mockGetAll.mockReturnValue({ data: { items: [] } });
    render(<LeadCombobox value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Search leads/i);

    fireEvent.change(input, { target: { value: "zzz" } });

    await waitFor(() => {
      expect(screen.getByText(/No leads found/i)).toBeInTheDocument();
    });
  });

  it("does not show the dropdown before the user types", () => {
    render(<LeadCombobox value="" onChange={onChange} />);
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("uses a custom placeholder when provided", () => {
    render(<LeadCombobox value="" onChange={onChange} placeholder="Pick a lead…" />);
    expect(screen.getByPlaceholderText("Pick a lead…")).toBeInTheDocument();
  });
});

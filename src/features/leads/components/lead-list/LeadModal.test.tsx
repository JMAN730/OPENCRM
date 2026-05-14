import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadModal } from "./LeadModal";

const invalidate = vi.fn();
const outcomeMutate = vi.fn();
const tempMutate = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: { role: "ADMIN" },
    },
  })),
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      leads: {
        getAll: { invalidate },
        getNotes: { invalidate: vi.fn() },
      },
    }),
    leads: {
      getNotes: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      updateCallOutcome: {
        useMutation: vi.fn(() => ({ mutate: outcomeMutate, isPending: false })),
      },
      updateTemperatureOverride: {
        useMutation: vi.fn(() => ({ mutate: tempMutate, isPending: false })),
      },
      assign: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      createNote: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
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
    company: "Acme",
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders website as a clickable external link", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    const websiteLink = screen.getByRole("link", { name: "acme.com" });
    expect(websiteLink).toHaveAttribute("href", "https://acme.com");
  });

  it("shows reviews next to lead score context", () => {
    render(<LeadModal lead={lead} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getAllByText("4.6 ★ (128 reviews)").length).toBeGreaterThan(0);
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
});

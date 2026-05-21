import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScoringRulesPanel } from "./ScoringRulesPanel";

const upsertMutate = vi.fn();
const deleteMutate = vi.fn();
const resetMutate = vi.fn();
const invalidateRules = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({ scoring: { getRules: { invalidate: invalidateRules } } }),
    scoring: {
      getRules: {
        useQuery: () => ({ data: mockRules, isLoading: false }),
      },
      upsertRule: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: () => void }) => ({
          mutate: (args: unknown, callbacks?: { onSuccess?: () => void; onError?: () => void }) => {
            upsertMutate(args);
            callbacks?.onSuccess?.();
            onSuccess();
          },
          isPending: false,
        }),
      },
      deleteRule: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: () => void }) => ({
          mutate: (args: unknown, callbacks?: { onError?: () => void }) => {
            deleteMutate(args);
            onSuccess();
          },
          isPending: false,
        }),
      },
      resetToDefaults: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: () => void }) => ({
          mutate: () => { resetMutate(); onSuccess(); },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let mockRules: Array<{
  id: string;
  factor: string;
  label: string;
  maxPoints: number;
  weight: number;
  isActive: boolean;
  sortOrder: number;
  config: Record<string, number> | null;
}> = [];

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    factor: "star_rating",
    label: "Star Rating",
    maxPoints: 20,
    weight: 1.0,
    isActive: true,
    sortOrder: 0,
    config: null,
    ...overrides,
  };
}

describe("ScoringRulesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
    mockRules = [makeRule()];
  });

  it("renders the Scoring Rules heading", () => {
    render(<ScoringRulesPanel />);
    expect(screen.getByText("Scoring Rules")).toBeInTheDocument();
  });

  it("does not show the loading indicator when rules have loaded", () => {
    render(<ScoringRulesPanel />);
    expect(screen.queryByText(/Loading scoring rules/i)).not.toBeInTheDocument();
  });

  it("renders each active rule with its label", () => {
    render(<ScoringRulesPanel />);
    // The label appears in both the rule row and the preview factor description
    expect(screen.getAllByText("Star Rating").length).toBeGreaterThan(0);
  });

  it("renders the live preview panel by default", () => {
    render(<ScoringRulesPanel />);
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
  });

  it("hides the live preview when 'Hide Preview' is clicked", async () => {
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hide Preview/i }));
    await waitFor(() => {
      expect(screen.queryByText("Live Preview")).not.toBeInTheDocument();
    });
  });

  it("shows the live preview again when 'Show Preview' is clicked", async () => {
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hide Preview/i }));
    await waitFor(() => expect(screen.queryByText("Live Preview")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Show Preview/i }));
    await waitFor(() => expect(screen.getByText("Live Preview")).toBeInTheDocument());
  });

  it("calls deleteRule when delete button is clicked and confirmed", async () => {
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByTitle("Delete rule"));
    await waitFor(() => {
      expect(deleteMutate).toHaveBeenCalledWith({ id: "rule-1" });
    });
  });

  it("does not call deleteRule when confirm is dismissed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByTitle("Delete rule"));
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("calls resetToDefaults when Reset is confirmed", async () => {
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    await waitFor(() => {
      expect(resetMutate).toHaveBeenCalled();
    });
  });

  it("does not reset when confirm is dismissed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(resetMutate).not.toHaveBeenCalled();
  });

  it("toggles rule active state inline and calls upsert immediately", async () => {
    render(<ScoringRulesPanel />);
    // First checkbox is the rule's isActive toggle; second is the preview "has website"
    const [ruleCheckbox] = screen.getAllByRole("checkbox");
    fireEvent.click(ruleCheckbox);

    await waitFor(() => {
      expect(upsertMutate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "rule-1", isActive: false }),
      );
    });
  });

  it("shows 'Add Factor' button when there are available factors not yet used", () => {
    // Only one factor used out of 8 available — Add Factor should appear
    render(<ScoringRulesPanel />);
    expect(screen.getByRole("button", { name: /Add Factor/i })).toBeInTheDocument();
  });

  it("does not show 'Add Factor' when all factors are in use", () => {
    const allFactors = [
      "star_rating", "review_count", "has_website", "lead_status",
      "call_activity", "business_category", "last_contacted", "appointment_booked",
    ];
    mockRules = allFactors.map((f, i) => makeRule({ id: `rule-${i}`, factor: f }));
    render(<ScoringRulesPanel />);
    expect(screen.queryByRole("button", { name: /Add Factor/i })).not.toBeInTheDocument();
  });

  it("shows factor picker when 'Add Factor' is clicked", async () => {
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Add Factor/i }));
    await waitFor(() => {
      // At least one available factor button should appear
      expect(screen.getByRole("button", { name: /review count/i })).toBeInTheDocument();
    });
  });

  it("calls upsert when an available factor is selected from the picker", async () => {
    render(<ScoringRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Add Factor/i }));
    await waitFor(() => screen.getByRole("button", { name: /review count/i }));
    fireEvent.click(screen.getByRole("button", { name: /review count/i }));

    await waitFor(() => {
      expect(upsertMutate).toHaveBeenCalledWith(
        expect.objectContaining({ factor: "review_count", isActive: true }),
      );
    });
  });

  it("renders the preview score display", () => {
    render(<ScoringRulesPanel />);
    expect(screen.getByText("Total Score")).toBeInTheDocument();
  });

  it("renders the preview lead editor fields", () => {
    render(<ScoringRulesPanel />);
    // The preview panel has number inputs for rating and review count.
    // Labels are not linked via htmlFor so we query by role/type.
    const spinbuttons = screen.getAllByRole("spinbutton");
    expect(spinbuttons.length).toBeGreaterThanOrEqual(2);
    // Status and Call Outcome selects are present
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });
});

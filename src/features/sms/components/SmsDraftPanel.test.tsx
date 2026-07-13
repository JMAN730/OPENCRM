import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmsDraftPanel } from "./SmsDraftPanel";

const generateMutate = vi.fn();
const updateMutate = vi.fn();
const sendMutate = vi.fn();
let queryData: unknown;

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      sms: { getDraftForLead: { invalidate: vi.fn() } },
    }),
    sms: {
      getDraftForLead: {
        useQuery: vi.fn(() => ({ data: queryData, isLoading: false })),
      },
      generate: {
        useMutation: vi.fn(() => ({ mutate: generateMutate, isPending: false })),
      },
      updateDraft: {
        useMutation: vi.fn(() => ({ mutate: updateMutate, isPending: false })),
      },
      send: {
        useMutation: vi.fn(() => ({ mutate: sendMutate, isPending: false })),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("SmsDraftPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a not-configured notice without exposing send controls", () => {
    queryData = { configured: false, draft: null };

    render(<SmsDraftPanel leadId="lead-1" />);

    expect(screen.getByText("Twilio SMS not configured")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send sms/i })).not.toBeInTheDocument();
  });

  it("lets the user edit and save the draft body before sending", () => {
    queryData = {
      configured: true,
      draft: {
        id: "sms-1",
        body: "Original body",
        status: "DRAFT",
        sentAt: null,
        events: [],
      },
    };
    render(<SmsDraftPanel leadId="lead-1" />);

    fireEvent.change(screen.getByLabelText("Message body"), {
      target: { value: "Personalized body" },
    });

    expect(screen.getByRole("button", { name: "Send SMS" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenCalledWith({
      id: "sms-1",
      body: "Personalized body",
    });
  });

  it("sends only after the user explicitly confirms", () => {
    queryData = {
      configured: true,
      draft: {
        id: "sms-1",
        body: "Ready body",
        status: "DRAFT",
        sentAt: null,
        events: [],
      },
    };
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<SmsDraftPanel leadId="lead-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Send SMS" }));
    expect(sendMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send SMS" }));
    expect(sendMutate).toHaveBeenCalledWith({ id: "sms-1" });
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  draft: null as null | {
    id: string;
    body: string;
    status: "DRAFT" | "SENT" | "DELIVERED" | "FAILED";
    toPhone: string;
    sentAt: Date | null;
    events: unknown[];
  },
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({ sms: { getForLead: { invalidate: vi.fn() } } }),
    sms: {
      configuration: { useQuery: () => ({ data: { configured: state.configured } }) },
      getForLead: {
        useQuery: () => ({ data: state.draft, isLoading: false, refetch: vi.fn() }),
      },
      generate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateBody: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      send: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { SmsDraftPanel } from "./SmsDraftPanel";

describe("SmsDraftPanel", () => {
  beforeEach(() => {
    state.configured = true;
    state.draft = null;
  });

  it("degrades visibly when Twilio SMS is not configured", () => {
    state.configured = false;
    render(<SmsDraftPanel leadId="lead-1" />);
    expect(screen.getByText(/twilio sms is not configured/i)).toBeInTheDocument();
  });

  it("shows an editable draft and requires an explicit send action", () => {
    state.draft = {
      id: "sms-1",
      body: "Hi there — demo link. Reply STOP to opt out.",
      status: "DRAFT",
      toPhone: "+15552345678",
      sentAt: null,
      events: [],
    };
    render(<SmsDraftPanel leadId="lead-1" />);

    expect(screen.getByLabelText("SMS message")).toHaveValue(state.draft.body);
    expect(screen.getByRole("button", { name: /send sms/i })).toBeInTheDocument();
  });
});

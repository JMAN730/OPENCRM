import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_trpc/client", () => ({ trpc: {} }));

import { OutreachDraftSummary } from "./OutreachQueue";

describe("OutreachDraftSummary", () => {
  it("shows the SMS channel and message preview", () => {
    render(
      <OutreachDraftSummary
        draft={{
          id: "sms-1",
          channel: "SMS",
          body: "Hi there — here is your demo website. Reply STOP to opt out.",
          status: "DRAFT",
          sentAt: null,
        }}
        onReview={vi.fn()}
      />,
    );

    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText(/here is your demo website/i)).toBeInTheDocument();
  });

  it("shows the EMAIL channel and subject preview", () => {
    render(
      <OutreachDraftSummary
        draft={{
          id: "email-1",
          channel: "EMAIL",
          subject: "Quick demo for your business",
          body: "Hey there...",
          status: "DRAFT",
          sentAt: null,
        }}
        onReview={vi.fn()}
      />,
    );

    expect(screen.getByText("EMAIL")).toBeInTheDocument();
    expect(screen.getByText("Quick demo for your business")).toBeInTheDocument();
  });

  it("flags a failed SMS as a call-instead signal", () => {
    render(
      <OutreachDraftSummary
        draft={{
          id: "sms-1",
          channel: "SMS",
          body: "Demo link",
          status: "FAILED",
          sentAt: new Date(),
        }}
        onReview={vi.fn()}
      />,
    );
    expect(screen.getByText(/call instead/i)).toBeInTheDocument();
  });
});

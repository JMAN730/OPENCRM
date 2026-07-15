import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bulkSendMutateAsync = vi.fn();
const invalidateListMock = vi.fn();
const invalidateStatsMock = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      outreach: {
        list: { invalidate: invalidateListMock },
        stats: { invalidate: invalidateStatsMock },
      },
    }),
    outreach: {
      stats: { useQuery: vi.fn() },
      list: { useInfiniteQuery: vi.fn() },
      bulkSend: {
        useMutation: ({
          onSuccess,
          onError,
        }: {
          onSuccess?: (res: { sent: unknown[]; failed: unknown[] }) => void;
          onError?: (err: Error) => void;
        }) => ({
          mutateAsync: async (args: unknown) => {
            try {
              const res = await bulkSendMutateAsync(args);
              onSuccess?.(res);
              return res;
            } catch (err) {
              onError?.(err as Error);
              throw err;
            }
          },
          isPending: false,
        }),
      },
      retry: { useMutation: vi.fn() },
    },
    sms: {
      getForLead: { useQuery: vi.fn() },
      updateBody: { useMutation: vi.fn() },
    },
    emails: {
      getDraftForLead: { useQuery: vi.fn() },
      updateDraft: { useMutation: vi.fn() },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { OutreachDraftSummary, OutreachQueue } from "./OutreachQueue";

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

const statsQuery = trpc.outreach.stats.useQuery as unknown as ReturnType<typeof vi.fn>;
const listQuery = trpc.outreach.list.useInfiniteQuery as unknown as ReturnType<typeof vi.fn>;
const retryMutation = trpc.outreach.retry.useMutation as unknown as ReturnType<typeof vi.fn>;
const smsGetForLead = trpc.sms.getForLead.useQuery as unknown as ReturnType<typeof vi.fn>;
const smsUpdateBody = trpc.sms.updateBody.useMutation as unknown as ReturnType<typeof vi.fn>;
const emailsGetDraftForLead = trpc.emails.getDraftForLead.useQuery as unknown as ReturnType<
  typeof vi.fn
>;
const emailsUpdateDraft = trpc.emails.updateDraft.useMutation as unknown as ReturnType<
  typeof vi.fn
>;

const smsItem = {
  id: "oj-sms",
  status: "DONE",
  attempts: 1,
  error: null,
  skipReason: null,
  processedAt: new Date(),
  createdAt: new Date(),
  lead: { id: "lead-sms", company: "Acme Plumbing", email: null, phone: "+15552345678", city: null, state: null },
  draft: {
    id: "sms-1",
    channel: "SMS" as const,
    body: "Hi there - demo link inside.",
    status: "DRAFT" as const,
    sentAt: null,
  },
  website: null,
};

const emailItem = {
  id: "oj-email",
  status: "DONE",
  attempts: 1,
  error: null,
  skipReason: null,
  processedAt: new Date(),
  createdAt: new Date(),
  lead: { id: "lead-email", company: "Acme Landscaping", email: "hi@acme.com", phone: null, city: null, state: null },
  draft: {
    id: "email-1",
    channel: "EMAIL" as const,
    subject: "Quick demo for your business",
    body: "Hey there...",
    status: "DRAFT" as const,
    sentAt: null,
  },
  website: null,
};

describe("OutreachQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statsQuery.mockReturnValue({
      data: { PENDING: 0, PROCESSING: 0, DONE: 2, FAILED: 0, SKIPPED: 0 },
      isLoading: false,
    });
    listQuery.mockReturnValue({
      data: { pages: [{ items: [smsItem, emailItem], nextCursor: undefined }] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    retryMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    smsGetForLead.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    smsUpdateBody.mockReturnValue({ mutate: vi.fn(), isPending: false });
    emailsGetDraftForLead.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    emailsUpdateDraft.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders a channel badge and preview for both an SMS and an email row", () => {
    render(<OutreachQueue />);

    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("EMAIL")).toBeInTheDocument();
    expect(screen.getByText(/demo link inside/i)).toBeInTheDocument();
    expect(screen.getByText("Quick demo for your business")).toBeInTheDocument();
  });

  it("selects an SMS and an email draft and bulk-sends them as a mixed batch, surfacing per-draft results", async () => {
    bulkSendMutateAsync.mockResolvedValue({
      sent: [{ id: "sms-1", channel: "SMS" }],
      failed: [{ id: "email-1", channel: "EMAIL", error: "This lead has opted out." }],
    });

    render(<OutreachQueue />);

    const smsRow = screen.getByText("Acme Plumbing").closest("tr")!;
    const emailRow = screen.getByText("Acme Landscaping").closest("tr")!;
    fireEvent.click(within(smsRow).getByRole("checkbox"));
    fireEvent.click(within(emailRow).getByRole("checkbox"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Send 2 selected/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Send 2 selected/i }));

    await waitFor(() => {
      expect(bulkSendMutateAsync).toHaveBeenCalledWith({
        drafts: [
          { id: "sms-1", channel: "SMS" },
          { id: "email-1", channel: "EMAIL" },
        ],
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Sent 1 outreach message.");
      expect(toast.error).toHaveBeenCalledWith("Send failed: This lead has opted out.");
      expect(invalidateListMock).toHaveBeenCalled();
      expect(invalidateStatsMock).toHaveBeenCalled();
    });
  });

  it("surfaces a toast error when the bulk send call rejects outright", async () => {
    bulkSendMutateAsync.mockRejectedValue(new Error("Rate limit exceeded."));

    render(<OutreachQueue />);

    const smsRow = screen.getByText("Acme Plumbing").closest("tr")!;
    const emailRow = screen.getByText("Acme Landscaping").closest("tr")!;
    fireEvent.click(within(smsRow).getByRole("checkbox"));
    fireEvent.click(within(emailRow).getByRole("checkbox"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Send 2 selected/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Send 2 selected/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Rate limit exceeded.");
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EmailDraftStatus } from "@prisma/client";

const { mockPrisma, mockVerify } = vi.hoisted(() => ({
  mockPrisma: {
    emailDraft: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    emailEvent: {
      create: vi.fn(),
    },
  },
  mockVerify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("svix", () => ({
  Webhook: class {
    verify = mockVerify;
  },
}));

import { POST } from "./route";

function makeRequest() {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1",
      "svix-signature": "sig",
    },
    body: "{}",
  });
}

describe("resend webhook UPGRADE_GUARD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    mockPrisma.emailEvent.create.mockResolvedValue({});
    mockPrisma.emailDraft.update.mockResolvedValue({});
  });

  it("does not downgrade a CLICKED draft when a late bounce arrives, but still records the event", async () => {
    mockVerify.mockReturnValue({ type: "email.bounced", data: { email_id: "rs_1" } });
    mockPrisma.emailDraft.findFirst.mockResolvedValue({ id: "d1", status: EmailDraftStatus.CLICKED });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // Status must NOT be overwritten with the lower BOUNCED state...
    expect(mockPrisma.emailDraft.update).not.toHaveBeenCalled();
    // ...but the raw event is always persisted for the audit trail.
    expect(mockPrisma.emailEvent.create).toHaveBeenCalledTimes(1);
  });

  it("records a bounce when the draft is still SENT", async () => {
    mockVerify.mockReturnValue({ type: "email.bounced", data: { email_id: "rs_2" } });
    mockPrisma.emailDraft.findFirst.mockResolvedValue({ id: "d2", status: EmailDraftStatus.SENT });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.emailDraft.update).toHaveBeenCalledWith({
      where: { id: "d2" },
      data: { status: EmailDraftStatus.BOUNCED },
    });
  });

  it("allows a spam complaint to be recorded after engagement", async () => {
    mockVerify.mockReturnValue({ type: "email.complained", data: { email_id: "rs_3" } });
    mockPrisma.emailDraft.findFirst.mockResolvedValue({ id: "d3", status: EmailDraftStatus.CLICKED });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockPrisma.emailDraft.update).toHaveBeenCalledWith({
      where: { id: "d3" },
      data: { status: EmailDraftStatus.COMPLAINED },
    });
  });
});

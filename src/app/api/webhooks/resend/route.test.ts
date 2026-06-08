import { describe, it, expect, beforeEach, vi } from "vitest";

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

function makeRequest(): Request {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": "id",
      "svix-timestamp": "ts",
      "svix-signature": "sig",
    },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = "test-secret";
});

describe("resend webhook UPGRADE_GUARD", () => {
  it("does not downgrade a CLICKED draft on a late bounce, but still records the event", async () => {
    mockVerify.mockReturnValue({ type: "email.bounced", data: { email_id: "msg-1" } });
    mockPrisma.emailDraft.findFirst.mockResolvedValue({ id: "draft-1", status: "CLICKED" });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // status must NOT be overwritten by the bounce
    expect(mockPrisma.emailDraft.update).not.toHaveBeenCalled();
    // the raw event is still persisted
    expect(mockPrisma.emailEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ draftId: "draft-1", event: "email.bounced" }) }),
    );
  });

  it("records a bounce as the status when the draft is still SENT", async () => {
    mockVerify.mockReturnValue({ type: "email.bounced", data: { email_id: "msg-2" } });
    mockPrisma.emailDraft.findFirst.mockResolvedValue({ id: "draft-2", status: "SENT" });

    await POST(makeRequest());

    expect(mockPrisma.emailDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "draft-2" }, data: { status: "BOUNCED" } }),
    );
  });

  it("does not downgrade an OPENED draft on a complaint", async () => {
    mockVerify.mockReturnValue({ type: "email.complained", data: { email_id: "msg-3" } });
    mockPrisma.emailDraft.findFirst.mockResolvedValue({ id: "draft-3", status: "OPENED" });

    await POST(makeRequest());

    expect(mockPrisma.emailDraft.update).not.toHaveBeenCalled();
    expect(mockPrisma.emailEvent.create).toHaveBeenCalled();
  });
});

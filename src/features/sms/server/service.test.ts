import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsConfigured, mockSendSmsMessage } = vi.hoisted(() => ({
  mockIsConfigured: vi.fn(),
  mockSendSmsMessage: vi.fn(),
}));

vi.mock("./twilio", () => ({
  isSmsConfigured: mockIsConfigured,
  sendSmsMessage: mockSendSmsMessage,
  validateTwilioWebhook: vi.fn(),
  smsStatusCallbackUrl: vi.fn(),
}));

import { createMockPrisma, type MockPrisma } from "@/test/trpc";
import {
  generateSmsDraftForLead,
  normalizePhoneNumber,
  OutreachSmsError,
  sendSmsDraft,
} from "./service";

describe("normalizePhoneNumber", () => {
  it.each([
    ["(555) 234-5678", "+15552345678"],
    ["1-555-234-5678", "+15552345678"],
    ["+1 555 234 5678", "+15552345678"],
    ["+44 20 7946 0958", "+442079460958"],
    ["0044 20 7946 0958", "+442079460958"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each([
    ["+1 (555) 123-4567 ext. 89", "+15551234567"],
    ["+1 (555) 123-4567 ext 89", "+15551234567"],
    ["+1 (555) 123-4567 extension 89", "+15551234567"],
    ["(555) 123-4567 x89", "+15551234567"],
    ["555-123-4567x89", "+15551234567"],
    ["5551234567#42", "+15551234567"],
  ])("strips the extension from %s instead of folding its digits in", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each([
    // 7-digit local number + 3-digit extension must not pass as a 10-digit NANP number.
    ["555-1234 ext 567"],
    ["not a phone"],
    ["+0 555 1234 5678"], // E.164 cannot start with 0
    ["12345"],
    [""],
    ["   "],
    [null],
    [undefined],
  ])("rejects %s", (input) => {
    expect(normalizePhoneNumber(input)).toBeNull();
  });
});

describe("generateSmsDraftForLead", () => {
  let prisma: MockPrisma;

  const lead = {
    id: "lead-1",
    organizationId: "org-1",
    firstName: "Sam",
    company: "Acme",
    phone: "+1 (555) 123-4567 ext. 89",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
    process.env.SENDER_NAME = "Opulence";
    process.env.NEXTAUTH_URL = "https://crm.example.com";
    delete process.env.NEXT_PUBLIC_APP_URL;
    prisma = createMockPrisma();
    prisma.generatedWebsite.findFirst.mockResolvedValue({ id: "web-1", slug: "acme-demo" });
    prisma.smsDraft.findFirst.mockResolvedValue(null);
    prisma.smsDraft.create.mockResolvedValue({ id: "sms-1" });
  });

  it("throws NOT_CONFIGURED when SENDER_NAME is missing instead of falling back", async () => {
    delete process.env.SENDER_NAME;

    await expect(
      generateSmsDraftForLead(prisma as never, lead as never, {
        organizationId: "org-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ name: "OutreachSmsError", code: "NOT_CONFIGURED" });
    expect(prisma.smsDraft.create).not.toHaveBeenCalled();
  });

  it("stores the extension-stripped E.164 destination", async () => {
    await expect(
      generateSmsDraftForLead(prisma as never, lead as never, {
        organizationId: "org-1",
        userId: "user-1",
      }),
    ).resolves.toEqual({ draftId: "sms-1" });
    expect(prisma.smsDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toPhone: "+15551234567" }),
    });
  });

  it("rejects a phone that is only plausible because of its extension digits", async () => {
    await expect(
      generateSmsDraftForLead(prisma as never, { ...lead, phone: "555-1234 ext 567" } as never, {
        organizationId: "org-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ name: "OutreachSmsError", code: "INVALID_PHONE" });
  });
});

describe("sendSmsDraft", () => {
  let prisma: MockPrisma;

  const draft = {
    id: "sms-1",
    leadId: "lead-1",
    organizationId: "org-1",
    toPhone: "+15550001111",
    body: "Hi - demo link. Reply STOP to opt out.",
    status: "DRAFT",
    lead: { id: "lead-1", company: "Acme", phone: "(555) 234-5678" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
    mockSendSmsMessage.mockResolvedValue({ messageSid: "SM123" });
    prisma = createMockPrisma();
    prisma.smsDraft.findFirst.mockResolvedValue(draft);
    prisma.smsDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.smsDraft.update.mockResolvedValue({});
  });

  it("re-normalizes the lead's current phone, sends to it, and persists it", async () => {
    await expect(
      sendSmsDraft(prisma as never, { draftId: "sms-1", organizationId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ messageId: "SM123" });

    // Opt-out is checked against the current destination, not the stale one.
    expect(prisma.phoneOptOut.findUnique).toHaveBeenCalledWith({
      where: { phone_organizationId: { phone: "+15552345678", organizationId: "org-1" } },
      select: { id: true },
    });
    expect(mockSendSmsMessage).toHaveBeenCalledWith({
      to: "+15552345678",
      body: draft.body,
      draftId: "sms-1",
    });
    expect(prisma.smsDraft.update).toHaveBeenCalledWith({
      where: { id: "sms-1" },
      data: expect.objectContaining({ toPhone: "+15552345678", twilioMessageSid: "SM123" }),
    });
  });

  it("fails with NO_PHONE when the lead no longer has a phone number", async () => {
    prisma.smsDraft.findFirst.mockResolvedValue({ ...draft, lead: { ...draft.lead, phone: null } });

    await expect(
      sendSmsDraft(prisma as never, { draftId: "sms-1", organizationId: "org-1", userId: "user-1" }),
    ).rejects.toMatchObject({ name: "OutreachSmsError", code: "NO_PHONE" });
    expect(prisma.smsDraft.updateMany).not.toHaveBeenCalled();
    expect(mockSendSmsMessage).not.toHaveBeenCalled();
  });

  it("fails with INVALID_PHONE when the lead's current phone cannot be normalized", async () => {
    prisma.smsDraft.findFirst.mockResolvedValue({
      ...draft,
      lead: { ...draft.lead, phone: "555-1234 ext 567" },
    });

    const attempt = sendSmsDraft(prisma as never, {
      draftId: "sms-1",
      organizationId: "org-1",
      userId: "user-1",
    });
    await expect(attempt).rejects.toBeInstanceOf(OutreachSmsError);
    await expect(attempt).rejects.toMatchObject({ code: "INVALID_PHONE" });
    expect(mockSendSmsMessage).not.toHaveBeenCalled();
  });
});

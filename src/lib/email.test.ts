import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendMail, mockCreateTransport } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({});
  const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail });
  return { mockSendMail, mockCreateTransport };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: mockCreateTransport },
}));

import { sendPasswordResetEmail, sendInvitationEmail } from "./email";

function clearSmtpEnv() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_SECURE;
}

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSmtpEnv();
  });

  it("logs reset URL to console and skips sendMail when SMTP_HOST is not configured", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendPasswordResetEmail("user@example.com", "https://example.com/reset/abc");

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://example.com/reset/abc"),
    );
    consoleSpy.mockRestore();
  });

  it("sends a reset email via transport when SMTP_HOST is set", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "noreply@example.com";

    await sendPasswordResetEmail("user@example.com", "https://example.com/reset/xyz");

    expect(mockCreateTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: expect.stringContaining("Reset"),
        html: expect.stringContaining("https://example.com/reset/xyz"),
        text: expect.stringContaining("https://example.com/reset/xyz"),
      }),
    );
  });

  it("falls back to SMTP_USER as from address when SMTP_FROM is absent", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "bot@example.com";

    await sendPasswordResetEmail("u@example.com", "https://example.com/reset");

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "bot@example.com" }),
    );
  });

  it("uses the default noreply address when both SMTP_FROM and SMTP_USER are absent", async () => {
    process.env.SMTP_HOST = "smtp.example.com";

    await sendPasswordResetEmail("u@example.com", "https://example.com/reset");

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@opencrm.app" }),
    );
  });

  it("passes SMTP_PORT as a number to createTransport", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";

    await sendPasswordResetEmail("u@example.com", "https://example.com/reset");

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465 }),
    );
  });
});

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSmtpEnv();
  });

  it("logs accept URL to console and skips sendMail when SMTP is not configured", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendInvitationEmail({
      to: "invitee@example.com",
      inviterName: "Alice",
      organizationName: "Acme Corp",
      acceptUrl: "https://example.com/accept/token",
    });

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://example.com/accept/token"),
    );
    consoleSpy.mockRestore();
  });

  it("sends invitation with inviter name and org name in subject and body", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "noreply@example.com";

    await sendInvitationEmail({
      to: "invitee@example.com",
      inviterName: "Alice",
      organizationName: "Acme Corp",
      acceptUrl: "https://example.com/accept/token",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "invitee@example.com",
        from: "noreply@example.com",
        subject: expect.stringContaining("Alice"),
        html: expect.stringContaining("Acme Corp"),
        text: expect.stringContaining("https://example.com/accept/token"),
      }),
    );
  });

  it("includes expiry notice in invitation email", async () => {
    process.env.SMTP_HOST = "smtp.example.com";

    await sendInvitationEmail({
      to: "invitee@example.com",
      inviterName: "Bob",
      organizationName: "Beta Inc",
      acceptUrl: "https://example.com/accept/token",
    });

    const call = mockSendMail.mock.calls[0][0] as { html: string; text: string };
    expect(call.html).toContain("7 days");
    expect(call.text).toContain("7 days");
  });
});

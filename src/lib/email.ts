import nodemailer from "nodemailer";

// Escape user-controlled values before interpolating them into HTML email
// bodies so an attacker-chosen org/inviter name can't inject markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendInvitationEmail(args: {
  to: string;
  inviterName: string;
  organizationName: string;
  acceptUrl: string;
}) {
  const { to, inviterName, organizationName, acceptUrl } = args;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@opencrm.app";

  const transport = createTransport();
  if (!transport) {
    console.log(
      `[Invitation] No SMTP configured — invite link for ${to}: ${acceptUrl}`,
    );
    return;
  }

  const safeInviter = escapeHtml(inviterName);
  const safeOrg = escapeHtml(organizationName);

  await transport.sendMail({
    from,
    to,
    subject: `${inviterName} invited you to join ${organizationName} on ClientCore`,
    html: `
      <p>${safeInviter} invited you to join <strong>${safeOrg}</strong> on ClientCore.</p>
      <p><a href="${acceptUrl}">Accept the invitation and set your password</a></p>
      <p>This link expires in 7 days.</p>
    `,
    text: `${inviterName} invited you to join ${organizationName} on ClientCore.\n\nAccept: ${acceptUrl}\n\nThis link expires in 7 days.`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@opencrm.app";

  const transport = createTransport();
  if (!transport) {
    console.log(`[Password Reset] No SMTP configured — reset link for ${to}: ${resetUrl}`);
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: "Reset your ClientCore password",
    html: `
      <p>You requested a password reset for your ClientCore account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
    `,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });
}

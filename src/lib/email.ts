import nodemailer from "nodemailer";

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

  await transport.sendMail({
    from,
    to,
    subject: `${inviterName} invited you to join ${organizationName} on OpenCRM`,
    html: `
      <p>${inviterName} invited you to join <strong>${organizationName}</strong> on OpenCRM.</p>
      <p><a href="${acceptUrl}">Accept the invitation and set your password</a></p>
      <p>This link expires in 7 days.</p>
    `,
    text: `${inviterName} invited you to join ${organizationName} on OpenCRM.\n\nAccept: ${acceptUrl}\n\nThis link expires in 7 days.`,
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
    subject: "Reset your OpenCRM password",
    html: `
      <p>You requested a password reset for your OpenCRM account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
    `,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });
}

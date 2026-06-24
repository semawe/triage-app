import nodemailer from "nodemailer";

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@triapp.fr";

// Brevo SMTP relay — credentials in BREVO_SMTP_USER / BREVO_SMTP_PASSWORD env vars
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER ?? "",
    pass: process.env.BREVO_SMTP_PASSWORD ?? "",
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string[];
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.BREVO_SMTP_PASSWORD) {
    return { ok: false, error: "BREVO_SMTP_PASSWORD non configurée" };
  }

  try {
    await transporter.sendMail({
      from: `"Triage App — Sémawé" <${EMAIL_FROM}>`,
      to: to.join(", "),
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

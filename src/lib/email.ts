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
    // Les destinataires vont en copie cachée, jamais en `To`.
    //
    // Ils étaient tous dans `To` : chaque membre et chaque invité d'une réunion
    // recevait l'adresse de tous les autres (revue adverse du 18/08/2026). Pour un
    // compte-rendu de réunion, ce sont des adresses professionnelles de plusieurs
    // organisations clientes — divulguées à chaque envoi, sans que personne ne
    // l'ait décidé. `to` reste l'expéditeur, pour que le message ait un
    // destinataire visible et ne soit pas classé indésirable.
    await transporter.sendMail({
      from: `"Triage App — Sémawé" <${EMAIL_FROM}>`,
      to: EMAIL_FROM,
      bcc: to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

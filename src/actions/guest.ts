"use server";

import { prisma } from "@/lib/prisma";
import { requireMeetingAccess } from "@/lib/session";
import { GUEST_COOKIE } from "@/lib/guest";
import { sendEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";

/**
 * Autorise l'appelant à gérer les invités d'une réunion : hôte (créateur) ou
 * admin de l'organisation. Renvoie le contexte réunion, ou null.
 */
async function requireGuestManager(meetingId: string) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return null;
  const isHost = ctx.meeting.createdById === ctx.session.user.id;
  const isAdmin = ctx.membership.role === "admin";
  if (!isHost && !isAdmin) return null;
  return ctx;
}

export async function inviteGuestToMeeting(
  meetingId: string,
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireGuestManager(meetingId);
  if (!ctx) return { ok: false, error: "Non autorisé." };

  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
  const name = ((formData.get("name") as string) ?? "").trim() || null;
  if (!email || !email.includes("@")) return { ok: false, error: "Adresse email invalide." };

  // Lien valable tant que la réunion n'est pas close (filet : 7 jours).
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const guest = await prisma.meetingGuest.upsert({
    where: { meetingId_email: { meetingId, email } },
    create: { meetingId, email, name, expiresAt },
    update: { name, revokedAt: null, expiresAt },
  });

  const locale = await getLocale().catch(() => "fr");
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/${locale}/guest/${guest.token}`;
  const title = ctx.meeting.title?.trim() || "une réunion";

  const result = await sendEmail({
    to: [email],
    subject: `Invitation à rejoindre ${title} sur Triage App`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:#1f2937;margin-bottom:8px">Tu es invité(e) à une réunion</h2>
        <p style="color:#4b5563">Tu peux rejoindre <strong>${escapeHtml(title)}</strong> en tant qu'invité ponctuel : suivre la réunion, ajouter des points à l'ordre du jour, et recevoir le compte-rendu. Aucun compte n'est nécessaire.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Rejoindre la réunion →
          </a>
        </p>
        <p style="color:#9ca3af;font-size:13px">Ce lien t'est personnel. Si tu n'es pas à l'origine de cette invitation, ignore cet email.</p>
      </div>
    `,
  });

  revalidatePath("/", "layout");
  if (!result.ok) {
    // Le lien existe quand même ; on signale juste l'échec d'envoi.
    return { ok: false, error: `Invité enregistré mais email non envoyé : ${result.error ?? "erreur SMTP"}.` };
  }
  return { ok: true };
}

export async function revokeGuest(meetingId: string, guestId: string) {
  const ctx = await requireGuestManager(meetingId);
  if (!ctx) return;

  // Ne révoquer qu'un invité de CETTE réunion (jamais un id arbitraire).
  await prisma.meetingGuest.updateMany({
    where: { id: guestId, meetingId },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/", "layout");
}

/**
 * Entrée d'un invité via son lien : valide le jeton, crée/relie un User léger
 * (sans appartenance à l'org, ne consomme pas de siège), pose le cookie invité
 * et redirige vers la vue invité de la réunion. Aucune authentification requise.
 */
export async function enterAsGuest(token: string, formData: FormData) {
  const guest = await prisma.meetingGuest.findUnique({ where: { token } });
  const locale = await getLocale().catch(() => "fr");
  if (!guest || guest.revokedAt || (guest.expiresAt && guest.expiresAt < new Date())) {
    redirect(`/${locale}/guest/${token}`); // la page rend l'état « lien invalide »
  }

  const name = ((formData.get("name") as string) ?? "").trim() || guest.name || guest.email;

  // User léger pour porter l'authorship. Si l'email correspond déjà à un compte,
  // on le réutilise (simple attribution, aucun droit d'org n'est accordé ici).
  const user = await prisma.user.upsert({
    where: { email: guest.email },
    create: { email: guest.email, name },
    update: {},
  });

  await prisma.meetingGuest.update({
    where: { id: guest.id },
    data: { userId: user.id, name },
  });

  const store = await cookies();
  store.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: guest.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  redirect(`/${locale}/guest-meeting/${guest.meetingId}`);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

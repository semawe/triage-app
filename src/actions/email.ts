"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";
import { sendEmail } from "@/lib/email";

const OUTPUT_LABELS: Record<string, string> = {
  note: "Note",
  action: "Action",
  decision: "Décision",
  project: "Projet",
  governance: "Gouvernance",
};

const OUTPUT_COLORS: Record<string, string> = {
  note: "background:#374151;color:#d1d5db",
  action: "background:#1e3a5f;color:#93c5fd",
  decision: "background:#3b1f5e;color:#c4b5fd",
  project: "background:#431407;color:#fdba74",
  governance: "background:#500724;color:#f9a8d4",
};

export async function sendMeetingRecap(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const meetingId = formData.get("meetingId") as string;
  if (!meetingId) return { ok: false, error: "meetingId manquant" };

  const { org } = await requireOrg();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      space: true,
      agendaItems: {
        orderBy: { order: "asc" },
        include: { outputs: { orderBy: { createdAt: "asc" } } },
      },
      guests: { where: { revokedAt: null }, select: { email: true } },
    },
  });

  if (!meeting || meeting.space.organisationId !== org.id) {
    return { ok: false, error: "Réunion introuvable" };
  }

  const members = await prisma.organisationMember.findMany({
    where: { organisationId: org.id },
    include: { user: { select: { email: true } } },
  });

  // Destinataires : membres de l'org + invités ponctuels de la réunion (#31).
  const memberEmails = members.map((m) => m.user.email).filter(Boolean) as string[];
  const guestEmails = meeting.guests.map((g) => g.email).filter(Boolean);
  const emails = Array.from(new Set([...memberEmails, ...guestEmails]));
  if (emails.length === 0) {
    return { ok: false, error: "Aucun destinataire trouvé" };
  }

  const dateLabel = meeting.date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const itemsWithOutputs = meeting.agendaItems.filter(
    (i) => i.outputs.length > 0
  );

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;">Compte-rendu de triage</h1>
  <p style="margin:0 0 2px;color:#555;font-size:15px;">${meeting.space.name} — ${dateLabel}</p>
  <p style="margin:0 0 24px;font-size:13px;color:#888;">${meeting.agendaItems.length} point${meeting.agendaItems.length !== 1 ? "s" : ""} traité${meeting.agendaItems.length !== 1 ? "s" : ""}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:24px;"/>
  ${
    itemsWithOutputs.length === 0
      ? '<p style="color:#888;font-size:14px;">Aucun output enregistré pour cette réunion.</p>'
      : itemsWithOutputs
          .map(
            (item) =>
              `<div style="margin-bottom:24px;">
    <p style="font-size:15px;font-weight:600;margin:0 0 10px;color:#111;">${escapeHtml(item.title)}</p>
    ${item.outputs
      .map(
        (o) =>
          `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;padding-left:12px;">
      <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0;${OUTPUT_COLORS[o.type] ?? OUTPUT_COLORS.note}">${OUTPUT_LABELS[o.type] ?? o.type}</span>
      <p style="margin:0;font-size:14px;color:#333;line-height:1.5;">${escapeHtml(o.content)}</p>
    </div>`
      )
      .join("")}
  </div>`
          )
          .join("")
  }
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:8px;"/>
  <p style="font-size:12px;color:#aaa;margin-top:12px;">Triage App — ${escapeHtml(org.name)}</p>
</body>
</html>`;

  return sendEmail({
    to: emails,
    subject: `Compte-rendu triage — ${meeting.space.name} — ${dateLabel}`,
    html,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

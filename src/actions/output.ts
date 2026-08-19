"use server";

import { prisma } from "@/lib/prisma";
import { requireMeetingAccess } from "@/lib/session";
import { peutVoirLaReunion } from "@/lib/visibility";
import { hasFeature } from "@/lib/features";
import { revalidatePath } from "next/cache";
import type { OutputType } from "@/generated/prisma";
import { broadcast } from "@/lib/sse";

/**
 * L'assigné proposé a-t-il le droit de voir cette réunion ?
 *
 * Sans ce contrôle, assigner une action à un membre extérieur à un cercle privé
 * lui livrait le contenu de la sortie, le titre de la réunion et le nom du cercle
 * sur ses écrans `/actions` et `/me` : une invitation implicite au contenu
 * confidentiel, décidée par le scribe sans que personne ne l'ait arbitrée
 * (revue adverse du 18/08/2026). Le formulaire ne propose plus que des assignés
 * légitimes ; ceci est le contrôle côté serveur, qui seul compte.
 *
 * Renvoie `null` si l'assigné est acceptable, sinon un code d'erreur.
 */
async function assigneAcceptable(
  meetingId: string,
  assigneeId: string | null
): Promise<boolean> {
  if (!assigneeId) return true;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      space: {
        select: {
          organisationId: true,
          isPrivate: true,
          organisation: { select: { features: true } },
        },
      },
    },
  });
  if (!meeting) return false;

  const membership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: meeting.space.organisationId,
        userId: assigneeId,
      },
    },
    select: { role: true },
  });
  if (!membership) return false; // pas même membre de l'organisation

  return peutVoirLaReunion({
    meeting,
    space: meeting.space,
    enabled: hasFeature(meeting.space.organisation, "confidentiality"),
    userId: assigneeId,
    role: membership.role,
  });
}

export async function addOutput(formData: FormData) {
  const itemId = formData.get("itemId") as string;
  const type = formData.get("type") as OutputType;
  const content = (formData.get("content") as string)?.trim();
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const dueDateStr = (formData.get("dueDate") as string) || null;

  if (!itemId || !type || !content) return;

  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId },
    select: { meetingId: true },
  });
  if (!item) return;

  const ctx = await requireMeetingAccess(item.meetingId);
  if (!ctx) return;
  // Seul le scribe saisit les outputs (retour #32). scribeId null = pas encore
  // de scribe (réunion héritée / non ouverte) → on n'ordonne pas la restriction.
  if (ctx.meeting.scribeId && ctx.meeting.scribeId !== ctx.session.user.id) return;

  if (!(await assigneAcceptable(item.meetingId, assigneeId || null))) return;

  await prisma.output.create({
    data: {
      itemId,
      authorId: ctx.session.user.id,
      type,
      content,
      assigneeId: assigneeId || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
    },
  });

  revalidatePath("/", "layout");
  broadcast(item.meetingId);
}

/**
 * Édition d'un output déjà enregistré (retour #32 : corriger une erreur de saisie
 * sur le point courant ou un point précédent). Réservé au scribe, comme la saisie.
 */
export async function updateOutput(outputId: string, formData: FormData) {
  const type = formData.get("type") as OutputType;
  const content = (formData.get("content") as string)?.trim();
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const dueDateStr = (formData.get("dueDate") as string) || null;
  if (!type || !content) return;

  const output = await prisma.output.findUnique({
    where: { id: outputId },
    select: { item: { select: { meetingId: true } } },
  });
  if (!output) return;

  const ctx = await requireMeetingAccess(output.item.meetingId);
  if (!ctx) return;
  if (ctx.meeting.scribeId && ctx.meeting.scribeId !== ctx.session.user.id) return;

  // Même contrôle qu'à la création : sinon la réassignation rouvre la porte fermée.
  if (!(await assigneAcceptable(output.item.meetingId, assigneeId || null))) return;

  await prisma.output.update({
    where: { id: outputId },
    data: {
      type,
      content,
      assigneeId: assigneeId || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
    },
  });

  revalidatePath("/", "layout");
  broadcast(output.item.meetingId);
}

/** Suppression d'un output (retour #32). Réservé au scribe. */
export async function deleteOutput(outputId: string) {
  const output = await prisma.output.findUnique({
    where: { id: outputId },
    select: { item: { select: { meetingId: true } } },
  });
  if (!output) return;

  const ctx = await requireMeetingAccess(output.item.meetingId);
  if (!ctx) return;
  if (ctx.meeting.scribeId && ctx.meeting.scribeId !== ctx.session.user.id) return;

  await prisma.output.delete({ where: { id: outputId } });

  revalidatePath("/", "layout");
  broadcast(output.item.meetingId);
}

export async function toggleOutputDone(outputId: string) {
  const output = await prisma.output.findUnique({
    where: { id: outputId },
    select: { isDone: true, item: { select: { meetingId: true } } },
  });
  if (!output) return;

  if (!(await requireMeetingAccess(output.item.meetingId))) return;

  await prisma.output.update({
    where: { id: outputId },
    data: { isDone: !output.isDone },
  });

  revalidatePath("/", "layout");
}

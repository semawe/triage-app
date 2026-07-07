"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireMeetingAccess } from "@/lib/session";
import { resolveParticipant } from "@/lib/guest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { broadcast } from "@/lib/sse";
import { hasFeature } from "@/lib/features";

function parseDatetimeLocal(value: string): Date {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

export async function createMeeting(formData: FormData) {
  const session = await requireAuth();

  const spaceId = formData.get("spaceId") as string;
  const dateStr = formData.get("date") as string;
  const durationStr = formData.get("duration") as string;
  const title = (formData.get("title") as string)?.trim() || null;
  if (!spaceId || !dateStr) return;

  // L'appelant doit être membre de l'organisation de l'espace cible.
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { organisationId: true },
  });
  if (!space) return;
  const membership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: space.organisationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) return;

  const durationMinutes = durationStr ? parseInt(durationStr, 10) : null;

  const meeting = await prisma.meeting.create({
    data: {
      spaceId,
      date: parseDatetimeLocal(dateStr),
      durationMinutes: durationMinutes || null,
      title: title || null,
      status: "draft",
      createdById: session.user.id,
      scribeId: session.user.id, // scribe par défaut = créateur ; redéfini à l'ouverture si besoin
    },
  });

  const locale = await getLocale().catch(() => "fr");
  redirect(`/${locale}/meetings/${meeting.id}`);
}

export async function updateMeetingTitle(meetingId: string, formData: FormData) {
  if (!(await requireMeetingAccess(meetingId))) return;

  const title = (formData.get("title") as string)?.trim() || null;
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { title },
  });

  revalidatePath("/", "layout");
}

export async function updateMeetingLink(meetingId: string, formData: FormData) {
  if (!(await requireMeetingAccess(meetingId))) return;

  const link = (formData.get("link") as string)?.trim() || null;
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { link },
  });

  revalidatePath("/", "layout");
}

export async function updateMeetingPrivacy(meetingId: string, isPrivate: boolean | null) {
  if (!(await requireMeetingAccess(meetingId))) return;

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { isPrivate },
  });

  revalidatePath("/", "layout");
}

export async function addAgendaItem(meetingId: string, formData: FormData) {
  // Membres comme invités peuvent ajouter un point (retour de test #31).
  const participant = await resolveParticipant(meetingId);
  if (!participant) return;

  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const agg = await prisma.agendaItem.aggregate({
    where: { meetingId },
    _max: { order: true },
  });

  await prisma.agendaItem.create({
    data: {
      meetingId,
      authorId: participant.userId,
      title,
      order: (agg._max.order ?? 0) + 1,
    },
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

async function activateFirstAgendaItem(meetingId: string) {
  const firstItem = await prisma.agendaItem.findFirst({
    where: { meetingId, status: "pending" },
    orderBy: { order: "asc" },
  });
  if (firstItem) {
    await prisma.agendaItem.update({
      where: { id: firstItem.id },
      data: { status: "active" },
    });
  }
}

export async function openMeeting(meetingId: string) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return;

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "open",
      openedAt: new Date(),
      // Scribe par défaut = l'ouvreur, sauf s'il est déjà défini (retour #32).
      ...(ctx.meeting.scribeId ? {} : { scribeId: ctx.session.user.id }),
    },
  });

  // Phase de synchro active → le triage ne démarre pas encore : les points
  // restent pending jusqu'à completeSyncPhase. Sinon, comportement historique.
  const syncPhase = hasFeature(ctx.meeting.space.organisation, "sync_phase", ctx.meeting.space);
  if (!syncPhase) {
    await activateFirstAgendaItem(meetingId);
  }

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

/**
 * Clôt la phase de synchro et démarre le triage (active le premier point).
 * Ouverte à tout participant, comme nextItem.
 */
export async function completeSyncPhase(meetingId: string) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return;
  if (ctx.meeting.status !== "open" || ctx.meeting.syncCompletedAt) return;

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { syncCompletedAt: new Date() },
  });
  await activateFirstAgendaItem(meetingId);

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

export async function jumpToItem(meetingId: string, targetItemId: string) {
  if (!(await requireMeetingAccess(meetingId))) return;

  // targetItemId doit appartenir à cette réunion (sinon on activerait
  // un point d'une autre réunion via un id arbitraire).
  await prisma.agendaItem.updateMany({
    where: { meetingId, status: "active" },
    data: { status: "pending" },
  });
  await prisma.agendaItem.updateMany({
    where: { id: targetItemId, meetingId },
    data: { status: "active" },
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

export async function nextItem(meetingId: string, currentItemId: string) {
  if (!(await requireMeetingAccess(meetingId))) return;

  await prisma.agendaItem.updateMany({
    where: { id: currentItemId, meetingId },
    data: { status: "done" },
  });

  const next = await prisma.agendaItem.findFirst({
    where: { meetingId, status: "pending" },
    orderBy: { order: "asc" },
  });

  if (next) {
    await prisma.agendaItem.update({
      where: { id: next.id },
      data: { status: "active" },
    });
  } else {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "closed" },
    });
  }

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

/**
 * Passage de relais du scribe (retour #32). Le scribe courant peut céder le stylo ;
 * un admin de l'org peut le réassigner (utile si le scribe a quitté la réunion).
 * Le nouveau scribe doit être membre de l'organisation de la réunion.
 */
export async function passScribe(meetingId: string, formData: FormData) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return;

  const isAdmin = ctx.membership.role === "admin";
  const isCurrentScribe = ctx.meeting.scribeId === ctx.session.user.id;
  if (!isAdmin && !isCurrentScribe) return;

  const newScribeId = formData.get("scribeId") as string;
  if (!newScribeId) return;

  const member = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: ctx.meeting.space.organisationId,
        userId: newScribeId,
      },
    },
  });
  if (!member) return;

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { scribeId: newScribeId },
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

export async function closeMeeting(meetingId: string) {
  if (!(await requireMeetingAccess(meetingId))) return;

  await prisma.agendaItem.updateMany({
    where: { meetingId, status: { in: ["active", "pending"] } },
    data: { status: "done" },
  });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: "closed" },
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

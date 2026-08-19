"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireMeetingAccess } from "@/lib/session";
import { resolveParticipant } from "@/lib/guest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { broadcast } from "@/lib/sse";
import { hasFeature } from "@/lib/features";
import type { Prisma } from "@/generated/prisma";

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

  // L'appelant doit être membre de l'organisation de l'espace cible, et voir
  // cet espace : on ne crée pas une réunion dans un cercle privé dont on
  // n'est pas membre.
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      organisationId: true,
      isPrivate: true,
      organisation: { select: { features: true } },
    },
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

  if (
    space.isPrivate &&
    hasFeature(space.organisation, "confidentiality") &&
    membership.role !== "admin"
  ) {
    const spaceMember = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: session.user.id } },
      select: { userId: true },
    });
    if (!spaceMember) return;
  }

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

  // Le formulaire est masqué après la clôture, mais l'action reste appelable.
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting || meeting.status === "closed") return;

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

type Tx = Prisma.TransactionClient;

/**
 * Sérialise les transitions d'agenda d'une réunion.
 *
 * Les enchaînements « lire l'état → écrire l'état suivant » n'étaient pas
 * transactionnels : deux facilitateurs cliquant en même temps pouvaient activer
 * deux points à la fois. Le verrou pessimiste sur la ligne réunion met les
 * transitions concurrentes à la queue leu leu (l'index partiel unique
 * `agenda_one_active_per_meeting` sert de dernier filet côté base).
 */
async function withMeetingLock<T>(
  meetingId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id = ${meetingId} FOR UPDATE`;
    return fn(tx);
  });
}

/**
 * La réunion est-elle ouverte ? Contrôle à faire SOUS le verrou : lu avant, le
 * statut peut changer entre la lecture et l'écriture, ce qui est exactement la
 * course entre `nextItem` et `closeMeeting`.
 */
async function reunionOuverte(tx: Tx, meetingId: string): Promise<boolean> {
  const m = await tx.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  return m?.status === "open";
}

async function activateFirstAgendaItem(tx: Tx, meetingId: string) {
  const firstItem = await tx.agendaItem.findFirst({
    where: { meetingId, status: "pending" },
    orderBy: { order: "asc" },
  });
  if (firstItem) {
    await tx.agendaItem.update({
      where: { id: firstItem.id },
      data: { status: "active" },
    });
  }
}

export async function openMeeting(meetingId: string) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return;

  // Précondition : on n'ouvre que ce qui est en brouillon. Sans elle, appeler
  // l'action sur une réunion close la rouvrait — les points étaient déjà marqués
  // terminés et les invités révoqués, donc la réunion « rouverte » était un état
  // que rien d'autre ne sait produire (revue adverse du 18/08/2026).
  if (ctx.meeting.status !== "draft") return;

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
    await withMeetingLock(meetingId, async (tx) => {
      const already = await tx.agendaItem.count({ where: { meetingId, status: "active" } });
      if (already === 0) await activateFirstAgendaItem(tx, meetingId);
    });
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

  await withMeetingLock(meetingId, async (tx) => {
    // Relecture sous verrou : deux clics simultanés lisaient tous deux
    // `syncCompletedAt = null` et activaient chacun un point.
    const fresh = await tx.meeting.findUnique({
      where: { id: meetingId },
      select: { status: true, syncCompletedAt: true },
    });
    if (!fresh || fresh.status !== "open" || fresh.syncCompletedAt) return;

    await tx.meeting.update({
      where: { id: meetingId },
      data: { syncCompletedAt: new Date() },
    });
    await activateFirstAgendaItem(tx, meetingId);
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

export async function jumpToItem(meetingId: string, targetItemId: string) {
  if (!(await requireMeetingAccess(meetingId))) return;

  // targetItemId doit appartenir à cette réunion (sinon on activerait
  // un point d'une autre réunion via un id arbitraire).
  await withMeetingLock(meetingId, async (tx) => {
    // Sous le verrou, et non avant : le statut lu hors verrou pourrait changer
    // entre la lecture et l'écriture — c'est la course avec la clôture.
    if (!(await reunionOuverte(tx, meetingId))) return;

    await tx.agendaItem.updateMany({
      where: { meetingId, status: "active" },
      data: { status: "pending" },
    });
    await tx.agendaItem.updateMany({
      where: { id: targetItemId, meetingId },
      data: { status: "active" },
    });
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

export async function nextItem(meetingId: string, currentItemId: string) {
  if (!(await requireMeetingAccess(meetingId))) return;

  await withMeetingLock(meetingId, async (tx) => {
    if (!(await reunionOuverte(tx, meetingId))) return;

    // Conditionné sur `active` : un second clic concurrent ne fait rien plutôt
    // que d'avancer une deuxième fois l'ordre du jour.
    const closed = await tx.agendaItem.updateMany({
      where: { id: currentItemId, meetingId, status: "active" },
      data: { status: "done" },
    });
    if (closed.count === 0) return;

    const next = await tx.agendaItem.findFirst({
      where: { meetingId, status: "pending" },
      orderBy: { order: "asc" },
    });

    if (next) {
      await tx.agendaItem.update({
        where: { id: next.id },
        data: { status: "active" },
      });
    } else {
      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: "closed" },
      });
    }
  });

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

  // Les trois écritures sous le MÊME verrou que les transitions d'agenda, et dans
  // une transaction. Séparées, elles laissaient deux états impossibles : `nextItem`
  // pouvait activer un point entre le marquage des points et le passage en
  // « close » (réunion close avec un point actif), et un échec après le passage en
  // « close » laissait les liens invités valables sept jours.
  await withMeetingLock(meetingId, async (tx) => {
    if (!(await reunionOuverte(tx, meetingId))) return;

    await tx.agendaItem.updateMany({
      where: { meetingId, status: { in: ["active", "pending"] } },
      data: { status: "done" },
    });

    await tx.meeting.update({
      where: { id: meetingId },
      data: { status: "closed" },
    });

    // Un lien invité vaut pour une réunion : il cesse de valoir quand elle est
    // close (il restait sinon actif jusqu'à son expiration de 7 jours).
    await tx.meetingGuest.updateMany({
      where: { meetingId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

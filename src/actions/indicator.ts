"use server";

import { prisma } from "@/lib/prisma";
import { requireMeetingAccess } from "@/lib/session";
import { canManageSpace } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { broadcast } from "@/lib/sse";

// ── Définitions (admin org ou lead d'espace) ──────────────────────────────────

export async function createIndicator(spaceId: string, formData: FormData) {
  const auth = await canManageSpace(spaceId);
  if (!auth.ok) return;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const unit = (formData.get("unit") as string)?.trim() || null;
  const frequency = (formData.get("frequency") as string)?.trim() || null;

  const last = await prisma.indicator.findFirst({
    where: { spaceId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.indicator.create({
    data: { spaceId, name, unit, frequency, order: (last?.order ?? -1) + 1 },
  });

  revalidatePath("/", "layout");
}

export async function updateIndicator(indicatorId: string, formData: FormData) {
  const indicator = await prisma.indicator.findUnique({ where: { id: indicatorId } });
  if (!indicator) return;

  const auth = await canManageSpace(indicator.spaceId);
  if (!auth.ok) return;

  const name = (formData.get("name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim() || null;
  const frequency = (formData.get("frequency") as string)?.trim() || null;

  await prisma.indicator.update({
    where: { id: indicatorId },
    data: { ...(name ? { name } : {}), unit, frequency },
  });

  revalidatePath("/", "layout");
}

export async function deleteIndicator(indicatorId: string) {
  const indicator = await prisma.indicator.findUnique({ where: { id: indicatorId } });
  if (!indicator) return;

  const auth = await canManageSpace(indicator.spaceId);
  if (!auth.ok) return;

  await prisma.indicator.delete({ where: { id: indicatorId } });

  revalidatePath("/", "layout");
}

// ── Relevé en réunion (tout participant) ──────────────────────────────────────

/**
 * Relève la valeur d'un indicateur pour une réunion. Un seul relevé par
 * (indicateur, réunion) : re-soumettre corrige la valeur (upsert).
 */
export async function logIndicatorValue(
  meetingId: string,
  indicatorId: string,
  formData: FormData
) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return;

  const rawValue = (formData.get("value") as string)?.trim().replace(",", ".");
  if (!rawValue) return;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  const note = (formData.get("note") as string)?.trim() || null;

  // L'indicateur doit appartenir à l'espace de la réunion (pas d'id arbitraire).
  const indicator = await prisma.indicator.findFirst({
    where: { id: indicatorId, spaceId: ctx.meeting.spaceId },
  });
  if (!indicator) return;

  await prisma.indicatorValue.upsert({
    where: { indicatorId_meetingId: { indicatorId, meetingId } },
    create: {
      indicatorId,
      meetingId,
      authorId: ctx.session.user.id,
      value,
      note,
    },
    update: { value, note, authorId: ctx.session.user.id, recordedAt: new Date() },
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

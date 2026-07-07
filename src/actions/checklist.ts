"use server";

import { prisma } from "@/lib/prisma";
import { requireMeetingAccess } from "@/lib/session";
import { canManageSpace } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { broadcast } from "@/lib/sse";

// ── Définitions (admin org ou lead d'espace) ──────────────────────────────────

export async function createChecklistItem(spaceId: string, formData: FormData) {
  const auth = await canManageSpace(spaceId);
  if (!auth.ok) return;

  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const last = await prisma.checklistItem.findFirst({
    where: { spaceId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.checklistItem.create({
    data: { spaceId, title, order: (last?.order ?? -1) + 1 },
  });

  revalidatePath("/", "layout");
}

export async function updateChecklistItem(itemId: string, formData: FormData) {
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const auth = await canManageSpace(item.spaceId);
  if (!auth.ok) return;

  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  await prisma.checklistItem.update({ where: { id: itemId }, data: { title } });

  revalidatePath("/", "layout");
}

export async function deleteChecklistItem(itemId: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const auth = await canManageSpace(item.spaceId);
  if (!auth.ok) return;

  await prisma.checklistItem.delete({ where: { id: itemId } });

  revalidatePath("/", "layout");
}

export async function reorderChecklistItem(itemId: string, direction: "up" | "down") {
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const auth = await canManageSpace(item.spaceId);
  if (!auth.ok) return;

  const neighbor = await prisma.checklistItem.findFirst({
    where: {
      spaceId: item.spaceId,
      order: direction === "up" ? { lt: item.order } : { gt: item.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.checklistItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
    prisma.checklistItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
  ]);

  revalidatePath("/", "layout");
}

// ── Coche en réunion (tout participant, pattern toggleOutputDone) ─────────────

export async function toggleChecklistCheck(meetingId: string, itemId: string) {
  const ctx = await requireMeetingAccess(meetingId);
  if (!ctx) return;

  // L'item doit appartenir à l'espace de la réunion (pas d'id arbitraire).
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, spaceId: ctx.meeting.spaceId },
  });
  if (!item) return;

  const existing = await prisma.checklistCheck.findUnique({
    where: { itemId_meetingId: { itemId, meetingId } },
  });
  const nextDone = !(existing?.isDone ?? false);

  await prisma.checklistCheck.upsert({
    where: { itemId_meetingId: { itemId, meetingId } },
    create: {
      itemId,
      meetingId,
      isDone: nextDone,
      checkedBy: ctx.session.user.id,
      checkedAt: new Date(),
    },
    update: {
      isDone: nextDone,
      checkedBy: nextDone ? ctx.session.user.id : null,
      checkedAt: nextDone ? new Date() : null,
    },
  });

  revalidatePath("/", "layout");
  broadcast(meetingId);
}

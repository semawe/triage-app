"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

export async function createMeeting(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const spaceId = formData.get("spaceId") as string;
  const dateStr = formData.get("date") as string;
  if (!spaceId || !dateStr) return;

  const meeting = await prisma.meeting.create({
    data: { spaceId, date: new Date(dateStr), status: "draft" },
  });

  const locale = await getLocale().catch(() => "fr");
  redirect(`/${locale}/meetings/${meeting.id}`);
}

export async function addAgendaItem(meetingId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const agg = await prisma.agendaItem.aggregate({
    where: { meetingId },
    _max: { order: true },
  });

  await prisma.agendaItem.create({
    data: {
      meetingId,
      authorId: session.user.id,
      title,
      order: (agg._max.order ?? 0) + 1,
    },
  });

  revalidatePath("/", "layout");
}

export async function openMeeting(meetingId: string) {
  const firstItem = await prisma.agendaItem.findFirst({
    where: { meetingId },
    orderBy: { order: "asc" },
  });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: "open" },
  });

  if (firstItem) {
    await prisma.agendaItem.update({
      where: { id: firstItem.id },
      data: { status: "active" },
    });
  }

  revalidatePath("/", "layout");
}

export async function nextItem(meetingId: string, currentItemId: string) {
  await prisma.agendaItem.update({
    where: { id: currentItemId },
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
}

export async function closeMeeting(meetingId: string) {
  await prisma.agendaItem.updateMany({
    where: { meetingId, status: { in: ["active", "pending"] } },
    data: { status: "done" },
  });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: "closed" },
  });

  revalidatePath("/", "layout");
}

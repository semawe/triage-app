"use server";

import { prisma } from "@/lib/prisma";
import { requireMeetingAccess } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { OutputType } from "@/generated/prisma";
import { broadcast } from "@/lib/sse";

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

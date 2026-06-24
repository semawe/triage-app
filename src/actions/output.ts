"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { OutputType } from "@/generated/prisma";
import { broadcast } from "@/lib/sse";

export async function addOutput(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const itemId = formData.get("itemId") as string;
  const type = formData.get("type") as OutputType;
  const content = (formData.get("content") as string)?.trim();
  const assigneeId = (formData.get("assigneeId") as string) || null;
  const dueDateStr = (formData.get("dueDate") as string) || null;

  if (!itemId || !type || !content) return;

  const item = await prisma.agendaItem.findUnique({ where: { id: itemId }, select: { meetingId: true } });

  await prisma.output.create({
    data: {
      itemId,
      authorId: session.user.id,
      type,
      content,
      assigneeId: assigneeId || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
    },
  });

  revalidatePath("/", "layout");
  if (item) broadcast(item.meetingId);
}

export async function toggleOutputDone(outputId: string) {
  const session = await auth();
  if (!session?.user?.id) return;

  const output = await prisma.output.findUnique({ where: { id: outputId } });
  if (!output) return;

  await prisma.output.update({
    where: { id: outputId },
    data: { isDone: !output.isDone },
  });

  revalidatePath("/", "layout");
}

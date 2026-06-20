"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { OutputType } from "@/generated/prisma";

export async function addOutput(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const itemId = formData.get("itemId") as string;
  const type = formData.get("type") as OutputType;
  const content = (formData.get("content") as string)?.trim();

  if (!itemId || !type || !content) return;

  await prisma.output.create({
    data: { itemId, authorId: session.user.id, type, content },
  });

  revalidatePath("/", "layout");
}

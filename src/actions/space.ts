"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createSpace(formData: FormData) {
  const { org } = await requireOrg();

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;
  const parentId = (formData.get("parentId") as string)?.trim() || null;

  if (!name || !type) return;

  // Validate parentId belongs to same org
  if (parentId) {
    const parent = await prisma.space.findFirst({
      where: { id: parentId, organisationId: org.id },
    });
    if (!parent) return;
  }

  await prisma.space.create({
    data: {
      organisationId: org.id,
      name,
      type: type as "circle" | "project" | "instance",
      parentId,
    },
  });

  revalidatePath("/", "layout");
}

export async function deleteSpace(spaceId: string) {
  const { org } = await requireOrg();

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
    include: { _count: { select: { meetings: true } } },
  });

  if (!space || space._count.meetings > 0) return;

  await prisma.space.delete({ where: { id: spaceId } });

  revalidatePath("/", "layout");
}

export async function updateSpacePrivacy(spaceId: string, isPrivate: boolean) {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return;

  await prisma.space.updateMany({
    where: { id: spaceId, organisationId: org.id },
    data: { isPrivate },
  });

  revalidatePath("/", "layout");
}

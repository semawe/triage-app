"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";
import { canManageSpace } from "@/lib/authz";
import { FEATURE_DEFAULTS, type FeatureKey } from "@/lib/features";
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

/**
 * Override par-espace d'un module (feature flag). `enabled = null` efface
 * l'override : l'espace retombe sur le réglage de l'organisation.
 * Autorisation : admin de l'org OU lead de l'espace (comme la gouvernance).
 */
export async function updateSpaceFeature(
  spaceId: string,
  key: FeatureKey,
  enabled: boolean | null
) {
  if (!(key in FEATURE_DEFAULTS)) return;

  const auth = await canManageSpace(spaceId);
  if (!auth.ok) return;

  const raw = auth.space.features;
  const current: Record<string, boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") current[k] = v;
    }
  }

  if (enabled === null) {
    delete current[key];
  } else {
    current[key] = enabled;
  }

  // Toujours écrire l'objet (même vide) : `undefined` signifierait « ne pas
  // mettre à jour » et l'effacement du dernier override ne serait pas persisté.
  await prisma.space.update({
    where: { id: spaceId },
    data: { features: current },
  });

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

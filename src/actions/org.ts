"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { FeatureKey } from "@/lib/features";
import { TRIAL_DAYS } from "@/lib/stripe";

export async function createOrg(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/login`);
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  // Redirect if user already has an org
  const existing = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/meetings`);
  }

  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  let slug = base;
  let attempt = 0;
  while (await prisma.organisation.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${base}-${attempt}`;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  await prisma.organisation.create({
    data: {
      name,
      slug,
      subscriptionStatus: "trial",
      trialEndsAt,
      members: { create: { userId: session.user.id, role: "admin" } },
      spaces: { create: { name: "Cercle principal", type: "circle" } },
    },
  });

  const locale = await getLocale().catch(() => "fr");
  redirect(`/${locale}/meetings`);
}

export async function switchOrg(orgId: string) {
  const session = await auth();
  if (!session?.user?.id) return;

  // Verify membership
  const membership = await prisma.organisationMember.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId: session.user.id } },
  });
  if (!membership) return;

  const cookieStore = await cookies();
  cookieStore.set("triage-active-org", orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  revalidatePath("/", "layout");
}

export async function updateOrgBranding(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const orgId = formData.get("orgId") as string;
  const logoUrl = (formData.get("logoUrl") as string)?.trim() || null;
  const primaryColor = (formData.get("primaryColor") as string)?.trim() || null;

  // Verify admin
  const membership = await prisma.organisationMember.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId: session.user.id } },
  });
  if (!membership || membership.role !== "admin") return;

  await prisma.organisation.update({
    where: { id: orgId },
    data: { logoUrl, primaryColor },
  });

  revalidatePath("/", "layout");
}

export async function updateOrgFeature(orgId: string, key: FeatureKey, enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) return;

  const membership = await prisma.organisationMember.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId: session.user.id } },
  });
  if (!membership || membership.role !== "admin") return;

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) return;

  const current = (typeof org.features === "object" && !Array.isArray(org.features) && org.features)
    ? (org.features as Record<string, boolean>)
    : {};

  await prisma.organisation.update({
    where: { id: orgId },
    data: { features: { ...current, [key]: enabled } },
  });

  revalidatePath("/", "layout");
}

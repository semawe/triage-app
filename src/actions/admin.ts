"use server";

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { TRIAL_DAYS } from "@/lib/stripe";
import type { FeatureKey } from "@/lib/features";

export async function adminSetOrgSubscription(formData: FormData) {
  await requireSuperAdmin();

  const orgId = formData.get("orgId") as string;
  const status = formData.get("status") as string;
  const seatCount = parseInt(formData.get("seatCount") as string, 10);
  const trialDays = parseInt(formData.get("trialDays") as string, 10);

  const data: Record<string, unknown> = { subscriptionStatus: status };

  if (!isNaN(seatCount) && seatCount > 0) data.seatCount = seatCount;

  if (status === "trial" && !isNaN(trialDays)) {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    data.trialEndsAt = trialEndsAt;
  }

  await prisma.organisation.update({ where: { id: orgId }, data });
  revalidatePath("/admin");
  revalidatePath(`/admin/org/${orgId}`);
}

export async function adminAddMember(formData: FormData) {
  await requireSuperAdmin();

  const orgId = formData.get("orgId") as string;
  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
  const role = (formData.get("role") as string) === "admin" ? "admin" : "member";

  if (!email) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  await prisma.organisationMember.upsert({
    where: { organisationId_userId: { organisationId: orgId, userId: user.id } },
    update: { role },
    create: { organisationId: orgId, userId: user.id, role },
  });

  revalidatePath(`/admin/org/${orgId}`);
}

export async function adminRemoveMember(memberId: string) {
  await requireSuperAdmin();
  await prisma.organisationMember.delete({ where: { id: memberId } });
  revalidatePath("/admin");
}

export async function adminSetMemberRole(memberId: string, role: "admin" | "member") {
  await requireSuperAdmin();
  await prisma.organisationMember.update({ where: { id: memberId }, data: { role } });
}

export async function adminSetOrgDomain(formData: FormData) {
  await requireSuperAdmin();

  const orgId = formData.get("orgId") as string;
  const domain = ((formData.get("domain") as string) ?? "").trim().toLowerCase().replace(/^@/, "");

  await prisma.organisation.update({
    where: { id: orgId },
    data: { allowedEmailDomain: domain || null },
  });

  revalidatePath(`/admin/org/${orgId}`);
}

export async function adminSetOrgFeature(orgId: string, key: FeatureKey, enabled: boolean) {
  await requireSuperAdmin();

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) return;

  const current =
    typeof org.features === "object" && !Array.isArray(org.features) && org.features
      ? (org.features as Record<string, boolean>)
      : {};

  await prisma.organisation.update({
    where: { id: orgId },
    data: { features: { ...current, [key]: enabled } },
  });

  revalidatePath(`/admin/org/${orgId}`);
}

export async function adminDeleteOrg(orgId: string) {
  await requireSuperAdmin();
  await prisma.organisation.delete({ where: { id: orgId } });
  revalidatePath("/admin");
  // La suppression vide la page courante /admin/org/[orgId] → rediriger vers /admin
  // pour éviter un 404 (retour de test #24).
  const locale = await getLocale().catch(() => "fr");
  redirect(`/${locale}/admin`);
}

export async function adminCreateOrg(formData: FormData) {
  await requireSuperAdmin();

  const name = ((formData.get("name") as string) ?? "").trim();
  if (!name) return;

  const adminEmail = ((formData.get("adminEmail") as string) ?? "").trim().toLowerCase();

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

  const org = await prisma.organisation.create({
    data: {
      name,
      slug,
      subscriptionStatus: "trial",
      trialEndsAt,
      spaces: { create: { name: "Cercle principal", type: "circle" } },
    },
  });

  if (adminEmail) {
    const user = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (user) {
      await prisma.organisationMember.create({
        data: { organisationId: org.id, userId: user.id, role: "admin" },
      });
    }
  }

  revalidatePath("/admin");
}

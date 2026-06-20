"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg, requireSuperAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

export async function updateMemberRole(
  memberId: string,
  newRole: "admin" | "member"
) {
  const { session, org } = await requireOrg();

  const currentUserMembership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: org.id,
        userId: session.user.id,
      },
    },
  });

  if (currentUserMembership?.role !== "admin") return;

  const target = await prisma.organisationMember.findUnique({
    where: { id: memberId },
  });

  if (!target) return;
  if (target.organisationId !== org.id) return;
  if (target.userId === session.user.id) return; // can't change own role

  await prisma.organisationMember.update({
    where: { id: memberId },
    data: { role: newRole },
  });

  revalidatePath("/", "layout");
}

export async function removeMember(memberId: string) {
  const { session, org } = await requireOrg();

  const currentUserMembership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: org.id,
        userId: session.user.id,
      },
    },
  });

  if (currentUserMembership?.role !== "admin") return;

  const target = await prisma.organisationMember.findUnique({
    where: { id: memberId },
  });

  if (!target) return;
  if (target.organisationId !== org.id) return;
  if (target.userId === session.user.id) return;

  await prisma.organisationMember.delete({ where: { id: memberId } });

  revalidatePath("/", "layout");
}

// ── Invitations ───────────────────────────────────────────────────────────────

export async function generateInvite(
  _prev: { url: string } | null,
  formData: FormData
): Promise<{ url: string }> {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return { url: "" };

  const role = (formData.get("role") as "admin" | "member") ?? "member";
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.pendingInvite.create({
    data: { orgId: org.id, role, expiresAt },
  });

  const locale = await getLocale().catch(() => "fr");
  return { url: `${process.env.AUTH_URL ?? "http://localhost:3000"}/${locale}/invite/${invite.token}` };
}

export async function acceptInvite(token: string) {
  const { session } = await requireOrg().catch(async () => {
    // user has no org yet — still need auth
    const session = await (await import("@/lib/session")).requireAuth();
    return { session, org: null as never, membership: null as never };
  });

  const invite = await prisma.pendingInvite.findUnique({ where: { token } });
  if (!invite || invite.expiresAt < new Date()) {
    const locale = await getLocale().catch(() => "fr");
    redirect(`/${locale}/invite-expired`);
    return;
  }

  // Add to org if not already a member
  await prisma.organisationMember.upsert({
    where: {
      organisationId_userId: {
        organisationId: invite.orgId,
        userId: session.user.id,
      },
    },
    create: {
      organisationId: invite.orgId,
      userId: session.user.id,
      role: invite.role,
    },
    update: {},
  });

  const locale = await getLocale().catch(() => "fr");
  redirect(`/${locale}/meetings`);
}

// ── Space members ─────────────────────────────────────────────────────────────

export async function addSpaceMember(
  spaceId: string,
  formData: FormData
) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  // Check if caller is space lead
  const callerSpaceMembership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isSpaceLead = callerSpaceMembership?.role === "lead";

  if (!isAdmin && !isSpaceLead) return;

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return;

  const userId = formData.get("userId") as string;
  const role = (formData.get("role") as "lead" | "member") ?? "member";
  if (!userId) return;

  await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId, userId } },
    create: { spaceId, userId, role },
    update: { role },
  });

  revalidatePath("/", "layout");
}

export async function updateSpaceMemberRole(
  spaceId: string,
  userId: string,
  newRole: "lead" | "member"
) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  const callerSpaceMembership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isSpaceLead = callerSpaceMembership?.role === "lead";

  if (!isAdmin && !isSpaceLead) return;

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return;

  await prisma.spaceMember.updateMany({ where: { spaceId, userId }, data: { role: newRole } });

  revalidatePath("/", "layout");
}

export async function removeSpaceMember(spaceId: string, userId: string) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  const callerSpaceMembership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isSpaceLead = callerSpaceMembership?.role === "lead";

  if (!isAdmin && !isSpaceLead) return;

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return;

  await prisma.spaceMember.deleteMany({ where: { spaceId, userId } });

  revalidatePath("/", "layout");
}

// ── Super admin ───────────────────────────────────────────────────────────────

export async function superAdminCreateOrg(formData: FormData) {
  await requireSuperAdmin();

  const name = (formData.get("name") as string)?.trim();
  const adminEmail = (formData.get("adminEmail") as string)?.trim();
  if (!name || !adminEmail) return;

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  const org = await prisma.organisation.create({
    data: {
      name,
      slug: `${slug}-${Date.now()}`,
      spaces: { create: { name: "Cercle principal", type: "circle" } },
    },
  });

  if (adminUser) {
    await prisma.organisationMember.create({
      data: { organisationId: org.id, userId: adminUser.id, role: "admin" },
    });
  }

  revalidatePath("/", "layout");
}

"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function canManageSpace(spaceId: string) {
  const { session, org, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";

  const space = await prisma.space.findFirst({
    where: { id: spaceId, organisationId: org.id },
  });
  if (!space) return { ok: false as const };

  const callerMember = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId: session.user.id } },
  });
  const isLead = callerMember?.role === "lead";

  if (!isAdmin && !isLead) return { ok: false as const };
  return { ok: true as const, session };
}

function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function updateSpaceGovernance(spaceId: string, formData: FormData) {
  const { ok } = await canManageSpace(spaceId);
  if (!ok) return;

  const purpose = (formData.get("purpose") as string | null)?.trim() || null;
  const domains = parseLines((formData.get("domains") as string) ?? "");
  const accountabilities = parseLines((formData.get("accountabilities") as string) ?? "");

  await prisma.space.update({
    where: { id: spaceId },
    data: { purpose, domains, accountabilities },
  });

  revalidatePath("/", "layout");
}

export async function createRole(spaceId: string, formData: FormData) {
  const { ok } = await canManageSpace(spaceId);
  if (!ok) return;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  await prisma.role.create({
    data: { spaceId, name },
  });

  revalidatePath("/", "layout");
}

export async function updateRole(roleId: string, formData: FormData) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { space: true } });
  if (!role) return;

  const { ok } = await canManageSpace(role.spaceId);
  if (!ok) return;

  const name = (formData.get("name") as string)?.trim();
  const purpose = (formData.get("purpose") as string | null)?.trim() || null;
  const domains = parseLines((formData.get("domains") as string) ?? "");
  const accountabilities = parseLines((formData.get("accountabilities") as string) ?? "");

  await prisma.role.update({
    where: { id: roleId },
    data: { ...(name ? { name } : {}), purpose, domains, accountabilities },
  });

  revalidatePath("/", "layout");
}

export async function deleteRole(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return;

  const { ok } = await canManageSpace(role.spaceId);
  if (!ok) return;

  await prisma.role.delete({ where: { id: roleId } });

  revalidatePath("/", "layout");
}

export async function assignRoleMember(roleId: string, formData: FormData) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return;

  const { ok } = await canManageSpace(role.spaceId);
  if (!ok) return;

  const userId = (formData.get("userId") as string)?.trim();
  if (!userId) return;

  await prisma.roleAssignment.upsert({
    where: {
      roleId_userId: { roleId, userId },
    },
    create: { roleId, userId },
    update: {},
  });

  revalidatePath("/", "layout");
}

export async function removeRoleAssignment(assignmentId: string) {
  const assignment = await prisma.roleAssignment.findUnique({
    where: { id: assignmentId },
    include: { role: true },
  });
  if (!assignment) return;

  const { ok } = await canManageSpace(assignment.role.spaceId);
  if (!ok) return;

  await prisma.roleAssignment.delete({ where: { id: assignmentId } });

  revalidatePath("/", "layout");
}

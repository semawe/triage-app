"use server";

import { prisma } from "@/lib/prisma";
import { canManageSpace } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import type { ProjectStatus } from "@/generated/prisma";

const PROJECT_STATUSES: ProjectStatus[] = ["active", "on_hold", "done"];

export async function createProject(spaceId: string, formData: FormData) {
  const auth = await canManageSpace(spaceId);
  if (!auth.ok) return;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const description = (formData.get("description") as string)?.trim() || null;

  await prisma.project.create({ data: { spaceId, name, description } });

  revalidatePath("/", "layout");
}

/**
 * Variante pour la page /projects : l'espace est choisi dans le formulaire.
 * Même garde que createProject (admin org ou lead de l'espace visé).
 */
export async function createProjectInSpace(formData: FormData) {
  const spaceId = (formData.get("spaceId") as string)?.trim();
  if (!spaceId) return;
  await createProject(spaceId, formData);
}

export async function updateProject(projectId: string, formData: FormData) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  const auth = await canManageSpace(project.spaceId);
  if (!auth.ok) return;

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  await prisma.project.update({
    where: { id: projectId },
    data: { ...(name ? { name } : {}), description },
  });

  revalidatePath("/", "layout");
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  if (!PROJECT_STATUSES.includes(status)) return;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  const auth = await canManageSpace(project.spaceId);
  if (!auth.ok) return;

  await prisma.project.update({ where: { id: projectId }, data: { status } });

  revalidatePath("/", "layout");
}

export async function deleteProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  const auth = await canManageSpace(project.spaceId);
  if (!auth.ok) return;

  await prisma.project.delete({ where: { id: projectId } });

  revalidatePath("/", "layout");
}

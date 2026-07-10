"use server";

import { prisma } from "@/lib/prisma";
import { canManageSpace } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import type { ProjectTaskStatus } from "@/generated/prisma";

const TASK_STATUSES: ProjectTaskStatus[] = ["todo", "doing", "done"];

/** Résout le projet et vérifie l'autorisation (admin org ou lead de son espace). */
async function authForProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const auth = await canManageSpace(project.spaceId);
  return auth.ok ? project : null;
}

export async function createProjectTask(projectId: string, formData: FormData) {
  const project = await authForProject(projectId);
  if (!project) return;

  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  const assigneeId = (formData.get("assigneeId") as string)?.trim() || null;
  const dueDateStr = (formData.get("dueDate") as string)?.trim() || null;

  const last = await prisma.projectTask.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.projectTask.create({
    data: {
      projectId,
      title,
      assigneeId,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      order: (last?.order ?? -1) + 1,
    },
  });

  revalidatePath("/", "layout");
}

export async function updateProjectTask(taskId: string, formData: FormData) {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const project = await authForProject(task.projectId);
  if (!project) return;

  const title = (formData.get("title") as string)?.trim();
  const assigneeId = (formData.get("assigneeId") as string)?.trim() || null;
  const dueDateStr = (formData.get("dueDate") as string)?.trim() || null;

  await prisma.projectTask.update({
    where: { id: taskId },
    data: {
      ...(title ? { title } : {}),
      assigneeId,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
    },
  });

  revalidatePath("/", "layout");
}

export async function updateProjectTaskStatus(taskId: string, status: ProjectTaskStatus) {
  if (!TASK_STATUSES.includes(status)) return;

  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const project = await authForProject(task.projectId);
  if (!project) return;

  await prisma.projectTask.update({ where: { id: taskId }, data: { status } });

  revalidatePath("/", "layout");
}

export async function deleteProjectTask(taskId: string) {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const project = await authForProject(task.projectId);
  if (!project) return;

  await prisma.projectTask.delete({ where: { id: taskId } });

  revalidatePath("/", "layout");
}

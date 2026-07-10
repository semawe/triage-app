import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { hasFeature } from "@/lib/features";
import { Link } from "@/i18n/navigation";
import {
  createProjectTask,
  updateProjectTaskStatus,
  deleteProjectTask,
} from "@/actions/projectTask";
import type { ProjectTaskStatus } from "@/generated/prisma";

type Props = { params: Promise<{ id: string }> };

const TASK_STATUSES: { key: ProjectTaskStatus; label: string; accent: string }[] = [
  { key: "todo", label: "À faire", accent: "border-gray-700" },
  { key: "doing", label: "En cours", accent: "border-indigo-800" },
  { key: "done", label: "Terminé", accent: "border-green-800" },
];

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const { org, session, membership } = await requireOrg();

  if (!hasFeature(org, "projects")) notFound();

  const project = await prisma.project.findFirst({
    where: { id, space: { organisationId: org.id } },
    include: {
      space: { select: { id: true, name: true } },
      tasks: {
        orderBy: { order: "asc" },
        include: { assignee: { select: { id: true, name: true, image: true } } },
      },
    },
  });
  if (!project) notFound();

  const isAdmin = membership.role === "admin";
  const isLead = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: project.spaceId, userId: session.user.id } },
    select: { role: true },
  });
  const canManage = isAdmin || isLead?.role === "lead";

  const orgMembers = canManage
    ? await prisma.organisationMember.findMany({
        where: { organisationId: org.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const createTask = createProjectTask.bind(null, project.id);
  const columns = TASK_STATUSES.map((st) => ({
    ...st,
    tasks: project.tasks.filter((t) => t.status === st.key),
  }));

  return (
    <AppShell>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/projects" className="hover:text-gray-300 transition-colors">Projets</Link>
        <span>›</span>
        <Link href={`/circles/${project.space.id}?tab=synchro`} className="hover:text-gray-300 transition-colors">
          {project.space.name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{project.name}</h1>
        {project.description && (
          <p className="mt-1 text-sm text-gray-500 max-w-2xl">{project.description}</p>
        )}
      </div>

      {/* Création — visible en permanence pour les leads/admins */}
      {canManage && (
        <div className="mb-6 rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            + Nouvelle tâche
          </p>
          <form action={createTask} className="flex gap-2 flex-wrap items-end">
            <input
              name="title"
              required
              placeholder="Intitulé de la tâche"
              className="flex-1 min-w-48 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <select
              name="assigneeId"
              defaultValue=""
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Non assignée</option>
              {orgMembers.map((m) => (
                <option key={m.userId} value={m.userId}>{m.user.name ?? m.user.id}</option>
              ))}
            </select>
            <input
              type="date"
              name="dueDate"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap"
            >
              Créer
            </button>
          </form>
        </div>
      )}

      {/* État vide */}
      {project.tasks.length === 0 && (
        <div className="mt-12 text-center space-y-2">
          <p className="text-3xl">📋</p>
          <p className="text-gray-400 text-sm">Aucune tâche pour l&apos;instant.</p>
          {!canManage && (
            <p className="text-xs text-gray-600">
              Les tâches sont créées par les leaders du cercle ou les admins.
            </p>
          )}
        </div>
      )}

      {/* Kanban des tâches */}
      {project.tasks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 items-start">
          {columns.map((col) => (
            <div key={col.key} className={`rounded-xl bg-gray-900 border ${col.accent} overflow-hidden ${col.key === "done" ? "opacity-80" : ""}`}>
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{col.label}</p>
                <span className="text-xs text-gray-600 tabular-nums">{col.tasks.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-16">
                {col.tasks.length === 0 && (
                  <p className="px-3 py-4 text-xs text-gray-700 text-center">—</p>
                )}
                {col.tasks.map((t) => (
                  <TaskCard key={t.id} task={t} canManage={canManage} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function TaskCard({
  task: t,
  canManage,
}: {
  task: {
    id: string;
    title: string;
    status: ProjectTaskStatus;
    dueDate: Date | null;
    assignee: { id: string; name: string | null; image: string | null } | null;
  };
  canManage: boolean;
}) {
  const isOverdue = t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();

  return (
    <div className="rounded-lg bg-gray-800/60 border border-gray-800 px-3 py-2.5 space-y-1.5">
      <p className={`text-sm font-medium leading-snug ${t.status === "done" ? "text-gray-500 line-through" : "text-white"}`}>
        {t.title}
      </p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {t.assignee && (
            <span className="text-xs text-gray-500">{t.assignee.name?.split(" ")[0]}</span>
          )}
          {t.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-red-400" : "text-gray-600"}`}>
              {isOverdue && "⚠ "}{new Date(t.dueDate).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex gap-1 text-[11px]">
            {TASK_STATUSES.filter((s) => s.key !== t.status).map((s) => (
              <form key={s.key} action={updateProjectTaskStatus.bind(null, t.id, s.key)}>
                <button
                  type="submit"
                  className="px-1.5 py-0.5 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                  title={`Passer en « ${s.label} »`}
                >
                  → {s.label}
                </button>
              </form>
            ))}
            {t.status === "done" && (
              <form action={deleteProjectTask.bind(null, t.id)}>
                <button
                  type="submit"
                  className="px-1.5 py-0.5 rounded text-gray-700 hover:text-red-400 transition-colors"
                  title="Supprimer définitivement"
                >
                  ✕
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

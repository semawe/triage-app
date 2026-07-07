import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createProjectInSpace, updateProjectStatus, deleteProject } from "@/actions/project";
import { hasFeature } from "@/lib/features";
import { Link } from "@/i18n/navigation";
import type { ProjectStatus } from "@/generated/prisma";

const STATUSES: { key: ProjectStatus; label: string; accent: string }[] = [
  { key: "active", label: "En cours", accent: "border-green-800" },
  { key: "on_hold", label: "En pause", accent: "border-yellow-800" },
  { key: "done", label: "Terminé", accent: "border-gray-700" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const { org, session, membership } = await requireOrg();

  if (!hasFeature(org, "projects")) notFound();

  const { space: spaceFilter } = await searchParams;
  const isAdmin = membership.role === "admin";

  const [spaces, projects, leadMemberships] = await Promise.all([
    prisma.space.findMany({
      where: { organisationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: {
        space: { organisationId: org.id },
        ...(spaceFilter ? { spaceId: spaceFilter } : {}),
      },
      include: { space: { select: { id: true, name: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.spaceMember.findMany({
      where: { userId: session.user.id, role: "lead", space: { organisationId: org.id } },
      select: { spaceId: true },
    }),
  ]);

  // Espaces où l'utilisateur peut créer un projet : tous pour un admin,
  // sinon ceux dont il est lead (même règle que l'onglet Synchro).
  const leadSpaceIds = new Set(leadMemberships.map((m) => m.spaceId));
  const creatableSpaces = isAdmin ? spaces : spaces.filter((s) => leadSpaceIds.has(s.id));
  const canCreate = creatableSpaces.length > 0;
  const defaultSpaceId =
    spaceFilter && creatableSpaces.some((s) => s.id === spaceFilter)
      ? spaceFilter
      : creatableSpaces[0]?.id;

  const columns = STATUSES.map((st) => ({
    ...st,
    projects: projects.filter((p) => p.status === st.key),
  }));

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">Projets</h1>

        {/* Filtre par espace */}
        {spaces.length > 1 && (
          <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs flex-wrap">
            <Link
              href="/projects"
              className={`px-3 py-1.5 ${!spaceFilter ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
            >
              Tous
            </Link>
            {spaces.map((s) => (
              <Link
                key={s.id}
                href={`/projects?space=${s.id}`}
                className={`px-3 py-1.5 ${spaceFilter === s.id ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Création — visible en permanence quand on a le droit */}
      {canCreate && (
        <div className="mb-6 rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            + Nouveau projet
          </p>
          <form action={createProjectInSpace} className="flex gap-2 flex-wrap items-end">
            <input
              name="name"
              required
              placeholder="Nom du projet"
              className="flex-1 min-w-48 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <input
              name="description"
              placeholder="Description (optionnel)"
              className="flex-1 min-w-48 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <select
              name="spaceId"
              defaultValue={defaultSpaceId}
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {creatableSpaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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
      {projects.length === 0 && (
        <div className="mt-12 text-center space-y-2">
          <p className="text-3xl">🚧</p>
          <p className="text-gray-400 text-sm">
            Aucun projet{spaceFilter ? " dans cet espace" : ""} pour l&apos;instant.
          </p>
          {canCreate ? (
            <p className="text-xs text-gray-600">
              Crée le premier avec le formulaire ci-dessus — il apparaîtra dans la colonne « En cours ».
            </p>
          ) : (
            <p className="text-xs text-gray-600">
              Les projets sont créés par les leaders d&apos;espace ou les admins, ici ou depuis
              l&apos;onglet Synchro d&apos;un cercle.
            </p>
          )}
        </div>
      )}

      {/* Kanban */}
      {projects.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 items-start">
          {columns.map((col) => (
            <div key={col.key} className={`rounded-xl bg-gray-900 border ${col.accent} overflow-hidden ${col.key === "done" ? "opacity-80" : ""}`}>
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{col.label}</p>
                <span className="text-xs text-gray-600 tabular-nums">{col.projects.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-16">
                {col.projects.length === 0 && (
                  <p className="px-3 py-4 text-xs text-gray-700 text-center">—</p>
                )}
                {col.projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    canManage={isAdmin || leadSpaceIds.has(p.spaceId)}
                    showSpace={!spaceFilter}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ProjectCard({
  project: p,
  canManage,
  showSpace,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    space: { id: string; name: string };
  };
  canManage: boolean;
  showSpace: boolean;
}) {
  return (
    <div className="rounded-lg bg-gray-800/60 border border-gray-800 px-3 py-2.5 space-y-1.5">
      <p className={`text-sm font-medium leading-snug ${p.status === "done" ? "text-gray-500 line-through" : "text-white"}`}>
        {p.name}
      </p>
      {p.description && (
        <p className="text-xs text-gray-500 leading-snug">{p.description}</p>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {showSpace ? (
          <Link
            href={`/circles/${p.space.id}?tab=synchro`}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {p.space.name}
          </Link>
        ) : <span />}
        {canManage && (
          <div className="flex gap-1 text-[11px]">
            {STATUSES.filter((s) => s.key !== p.status).map((s) => (
              <form key={s.key} action={updateProjectStatus.bind(null, p.id, s.key)}>
                <button
                  type="submit"
                  className="px-1.5 py-0.5 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                  title={`Passer en « ${s.label} »`}
                >
                  → {s.label}
                </button>
              </form>
            ))}
            {p.status === "done" && (
              <form action={deleteProject.bind(null, p.id)}>
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

import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { createSpace, deleteSpace } from "@/actions/space";
import { Link, redirect } from "@/i18n/navigation";
import CircleViz from "./CircleViz";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; parent?: string; circle?: string }>;
};

const TYPE_LABELS: Record<string, string> = {
  circle: "Cercle",
  project: "Projet",
  instance: "Instance",
};

const TYPE_COLORS: Record<string, string> = {
  circle: "bg-indigo-900/40 text-indigo-300 border-indigo-800",
  project: "bg-orange-900/40 text-orange-300 border-orange-800",
  instance: "bg-teal-900/40 text-teal-300 border-teal-800",
};

export default async function CirclesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { view, parent, circle: selCircle } = await searchParams;

  // Anciennes URLs `/circles?parent=<id>` : l'intérieur d'un cercle vit
  // désormais sur sa page canonique.
  if (parent) redirect({ href: `/circles/${parent}`, locale });

  const { org, session, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";
  const showList = view === "list";

  const spaces = await prisma.space.findMany({
    where: { organisationId: org.id },
    include: {
      members: {
        where: { role: "lead" },
        include: { user: { select: { id: true, name: true, image: true } } },
        take: 1,
      },
      _count: { select: { children: true, roles: true, meetings: true } },
      parent: { select: { id: true, name: true } },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const rootSpaces = spaces.filter((s) => !s.parentId);

  const vizSpaces = rootSpaces.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type as "circle" | "instance" | "project",
    purpose: s.purpose,
    leader: s.members[0]?.user ?? null,
    childCount: s._count.children,
    roleCount: s._count.roles,
  }));

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Cercles</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{org.name}</span>
          <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
            <Link
              href="/circles"
              className={`px-3 py-1.5 ${!showList ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
            >
              Carte
            </Link>
            <Link
              href="/circles?view=list"
              className={`px-3 py-1.5 ${showList ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
            >
              Liste
            </Link>
          </div>
        </div>
      </div>

      {showList ? (
        <ListView spaces={spaces} isAdmin={isAdmin} />
      ) : vizSpaces.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-16 text-center">
          <p className="text-sm text-gray-600">Aucun cercle pour l&apos;instant.</p>
          {isAdmin && (
            <p className="mt-1 text-xs text-gray-700">
              Crée le premier depuis la{" "}
              <Link href="/circles?view=list" className="underline hover:text-gray-500">vue liste</Link>.
            </p>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
          style={{ height: "calc(100vh - 200px)" }}
        >
          <CircleViz
            spaces={vizSpaces}
            roles={[]}
            currentUserId={session.user.id}
            brandColor={org.primaryColor ?? "#6366f1"}
            title={org.name}
            governanceHref={null}
            upHref={null}
            initialSelection={selCircle ? { kind: "space", id: selCircle } : null}
          />
        </div>
      )}
    </AppShell>
  );
}

// ── Vue liste (arborescence + administration) ────────────────────────────────

function ListView({
  spaces,
  isAdmin,
}: {
  spaces: {
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    _count: { children: number; roles: number; meetings: number };
  }[];
  isAdmin: boolean;
}) {
  const rootSpaces = spaces.filter((s) => !s.parentId);
  const childrenOf = (parentId: string) => spaces.filter((s) => s.parentId === parentId);

  type SpaceEntry = (typeof spaces)[number];
  const orderedSpaces: { space: SpaceEntry; depth: number }[] = [];
  function flatten(nodes: SpaceEntry[], depth: number) {
    for (const s of nodes) {
      orderedSpaces.push({ space: s, depth });
      flatten(childrenOf(s.id), depth + 1);
    }
  }
  flatten(rootSpaces, 0);
  // Orphelins (parentId posé mais parent introuvable — garde-fou)
  const listedIds = new Set(orderedSpaces.map((e) => e.space.id));
  for (const s of spaces) {
    if (!listedIds.has(s.id)) orderedSpaces.push({ space: s, depth: 0 });
  }

  return (
    <>
      {isAdmin && (
        <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Nouveau cercle
          </h2>
          <form action={createSpace} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Nom</label>
              <input
                type="text"
                name="name"
                required
                placeholder="Ex. Cercle Marketing"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-56"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Type</label>
              <select
                name="type"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="circle">Cercle</option>
                <option value="instance">Instance</option>
                <option value="project">Projet</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Sous-cercle de</label>
              <select
                name="parentId"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 max-w-44"
              >
                <option value="">— Racine —</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Créer
            </button>
          </form>
        </div>
      )}

      {orderedSpaces.length > 0 ? (
        <div className="space-y-1.5">
          {orderedSpaces.map(({ space, depth }) => {
            const del = deleteSpace.bind(null, space.id);
            const canDelete =
              isAdmin &&
              space._count.meetings === 0 &&
              space._count.children === 0 &&
              space._count.roles === 0;
            return (
              <div
                key={space.id}
                className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-5 py-3.5"
                style={{ marginLeft: depth * 24 }}
              >
                <Link
                  href={`/circles/${space.id}`}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  {depth > 0 && (
                    <span className="text-gray-700 text-xs select-none">└</span>
                  )}
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[space.type] ?? "bg-gray-700 text-gray-300 border-gray-600"}`}
                  >
                    {TYPE_LABELS[space.type] ?? space.type}
                  </span>
                  <span className="text-sm font-medium text-white">{space.name}</span>
                  {space._count.children > 0 && (
                    <span className="text-xs text-gray-600">
                      {space._count.children} sous-cercle{space._count.children > 1 ? "s" : ""}
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-600">
                    {space._count.meetings} réunion{space._count.meetings !== 1 ? "s" : ""}
                  </span>
                  {isAdmin && (
                    canDelete ? (
                      <form action={del}>
                        <button
                          type="submit"
                          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                          title="Supprimer"
                        >
                          Supprimer
                        </button>
                      </form>
                    ) : (
                      <span
                        className="text-xs text-gray-700 cursor-not-allowed"
                        title={
                          space._count.children > 0
                            ? "Ce cercle a des sous-cercles"
                            : space._count.roles > 0
                              ? "Ce cercle a des rôles"
                              : "Ce cercle a des réunions"
                        }
                      >
                        Supprimer
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-16 text-center text-gray-500">
          Aucun cercle.{isAdmin ? " Crée-en un ci-dessus." : ""}
        </p>
      )}
    </>
  );
}

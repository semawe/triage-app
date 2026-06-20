import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { createSpace, deleteSpace } from "@/actions/space";
import { Link } from "@/i18n/navigation";

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

export default async function SpacesPage() {
  const { org } = await requireOrg();

  const spaces = await prisma.space.findMany({
    where: { organisationId: org.id },
    include: {
      _count: { select: { meetings: true, children: true } },
      parent: { select: { id: true, name: true } },
    },
    orderBy: [{ parentId: "asc" }, { type: "asc" }, { name: "asc" }],
  });

  // Build tree for ordered display: root spaces first, then children indented
  const rootSpaces = spaces.filter((s) => !s.parentId);
  const childrenOf = (parentId: string) => spaces.filter((s) => s.parentId === parentId);

  type SpaceWithMeta = typeof spaces[number];
  const orderedSpaces: { space: SpaceWithMeta; depth: number }[] = [];
  function flatten(nodes: SpaceWithMeta[], depth: number) {
    for (const s of nodes) {
      orderedSpaces.push({ space: s, depth });
      flatten(childrenOf(s.id), depth + 1);
    }
  }
  flatten(rootSpaces, 0);
  // Orphans (parentId set but parent not found — shouldn't happen, just a safety net)
  const listedIds = new Set(orderedSpaces.map((e) => e.space.id));
  for (const s of spaces) {
    if (!listedIds.has(s.id)) orderedSpaces.push({ space: s, depth: 0 });
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Espaces</h1>
        <span className="text-sm text-gray-400">{org.name}</span>
      </div>

      {/* Create form */}
      <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Nouvel espace
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
              <option value="project">Projet</option>
              <option value="instance">Instance</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Sous-espace de</label>
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

      {/* List */}
      {orderedSpaces.length > 0 ? (
        <div className="space-y-1.5">
          {orderedSpaces.map(({ space, depth }) => {
            const del = deleteSpace.bind(null, space.id);
            const canDelete = space._count.meetings === 0 && space._count.children === 0;
            return (
              <div
                key={space.id}
                className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-5 py-3.5"
                style={{ marginLeft: depth * 24 }}
              >
                <Link
                  href={`/spaces/${space.id}`}
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
                      {space._count.children} sous-espace{space._count.children > 1 ? "s" : ""}
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-600">
                    {space._count.meetings} réunion{space._count.meetings !== 1 ? "s" : ""}
                  </span>
                  {canDelete ? (
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
                          ? "Cet espace a des sous-espaces"
                          : "Cet espace a des réunions"
                      }
                    >
                      Supprimer
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-16 text-center text-gray-500">
          Aucun espace. Créez-en un ci-dessus.
        </p>
      )}
    </AppShell>
  );
}

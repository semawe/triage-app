import { requireSuperAdmin, requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { superAdminCreateOrg } from "@/actions/member";
import { updateOrgBranding } from "@/actions/org";

export default async function AdminPage() {
  await requireSuperAdmin();
  const { org: currentOrg, membership } = await requireOrg();

  const orgs = await prisma.organisation.findMany({
    include: {
      _count: { select: { members: true, spaces: true } },
      members: {
        take: 3,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const updateBranding = updateOrgBranding;
  const isOrgAdmin = membership.role === "admin";

  return (
    <AppShell>
      <div className="mb-8 flex items-center gap-3">
        <span className="text-xs text-gray-500 bg-red-900/30 border border-red-800 rounded-full px-2.5 py-0.5 text-red-400 font-medium">
          Super admin
        </span>
        <h1 className="text-2xl font-bold text-white">Administration</h1>
      </div>

      {/* Branding de l'org active */}
      {isOrgAdmin && (
        <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Identité — {currentOrg.name}
          </h2>
          <form action={updateBranding} className="flex flex-wrap gap-4 items-end">
            <input type="hidden" name="orgId" value={currentOrg.id} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">URL du logo</label>
              <input
                type="url"
                name="logoUrl"
                defaultValue={currentOrg.logoUrl ?? ""}
                placeholder="https://example.com/logo.png"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-72"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Couleur principale</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  name="primaryColor"
                  defaultValue={currentOrg.primaryColor ?? "#6366f1"}
                  className="h-10 w-10 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer"
                />
                <input
                  type="text"
                  defaultValue={currentOrg.primaryColor ?? "#6366f1"}
                  className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-28"
                  readOnly
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Enregistrer
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-600">
            La couleur teinte la barre de navigation et les éléments actifs.
          </p>
        </div>
      )}

      {/* Create org */}
      <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Nouvelle organisation
        </h2>
        <form action={superAdminCreateOrg} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Nom</label>
            <input
              type="text"
              name="name"
              required
              placeholder="Ex. Acme Corp"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Email admin</label>
            <input
              type="email"
              name="adminEmail"
              placeholder="admin@example.com"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-52"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Créer
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-600">
          Si l&apos;email admin n&apos;a pas encore de compte, l&apos;org sera créée sans admin.
        </p>
      </div>

      {/* Org list */}
      <div className="space-y-3">
        {orgs.map((org) => (
          <div key={org.id} className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {org.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoUrl} alt={org.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span
                    className="h-8 w-8 rounded text-sm font-bold flex items-center justify-center text-white"
                    style={{ background: org.primaryColor ?? "#6366f1" }}
                  >
                    {org.name[0]?.toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="text-sm font-semibold text-white">{org.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">slug: {org.slug}</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-gray-500 shrink-0">
                <span>{org._count.members} membre{org._count.members !== 1 ? "s" : ""}</span>
                <span>{org._count.spaces} espace{org._count.spaces !== 1 ? "s" : ""}</span>
              </div>
            </div>
            {org.members.length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {org.members.map((m) => (
                  <span key={m.id} className="text-xs text-gray-500 bg-gray-800 rounded px-2 py-0.5">
                    {m.user.name ?? m.user.email}
                    {m.role === "admin" && " (admin)"}
                  </span>
                ))}
                {org._count.members > 3 && (
                  <span className="text-xs text-gray-600">+{org._count.members - 3} autres</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

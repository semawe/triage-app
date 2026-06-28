import { requireSuperAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { Link } from "@/i18n/navigation";

export default async function AdminUsersPage() {
  await requireSuperAdmin();

  const users = await prisma.user.findMany({
    include: {
      superAdmin: { select: { userId: true } },
      orgMemberships: {
        include: { organisation: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
          ← Admin
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-xs font-medium text-red-400 bg-red-900/30 border border-red-800 rounded-full px-2.5 py-0.5">
          Super admin
        </span>
        <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {users.length} utilisateur{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="divide-y divide-gray-800">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {u.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.image} alt="" className="h-8 w-8 rounded-full shrink-0" />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-gray-700 text-sm font-semibold flex items-center justify-center shrink-0 text-gray-200">
                    {(u.name ?? u.email)[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                    {u.name ?? "—"}
                    {u.superAdmin && (
                      <span className="rounded-full border border-red-800 bg-red-900/30 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                        Super admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 max-w-[50%] flex-wrap justify-end">
                {u.orgMemberships.length === 0 ? (
                  <span className="text-xs text-gray-500">Aucune organisation</span>
                ) : (
                  u.orgMemberships.map((m) => (
                    <Link
                      key={m.id}
                      href={`/admin/org/${m.organisation.id}`}
                      className="rounded-full border border-gray-600 bg-gray-800 px-2.5 py-0.5 text-xs text-gray-200 hover:border-indigo-700 hover:text-white transition-colors"
                    >
                      {m.organisation.name}
                      <span className={m.role === "admin" ? "text-amber-300" : "text-gray-500"}>
                        {m.role === "admin" ? " · admin" : " · membre"}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

import { requireSuperAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { adminCreateOrg } from "@/actions/admin";
import { Link } from "@/i18n/navigation";

const STATUS_COLORS: Record<string, string> = {
  trial:    "text-yellow-400 bg-yellow-900/20 border-yellow-800",
  active:   "text-green-400 bg-green-900/20 border-green-800",
  past_due: "text-red-400 bg-red-900/20 border-red-800",
  canceled: "text-gray-400 bg-gray-800 border-gray-700",
};
const STATUS_LABELS: Record<string, string> = {
  trial: "Essai", active: "Actif", past_due: "En retard", canceled: "Résilié",
};

export default async function AdminPage() {
  await requireSuperAdmin();

  const [orgs, userCount] = await Promise.all([
    prisma.organisation.findMany({
      include: {
        _count: { select: { members: true, spaces: true } },
        members: {
          take: 3,
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count(),
  ]);

  const activeOrgs = orgs.filter((o) => o.subscriptionStatus === "active").length;

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <span className="text-xs font-medium text-red-400 bg-red-900/30 border border-red-800 rounded-full px-2.5 py-0.5">
          Super admin
        </span>
        <h1 className="text-2xl font-bold text-white">Administration plateforme</h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[
          { label: "Organisations", value: orgs.length },
          { label: "Utilisateurs", value: userCount, href: "/admin/users" },
          { label: "Abonnements actifs", value: activeOrgs },
        ].map((s) => {
          const inner = (
            <>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {s.label}
                {s.href && <span className="text-indigo-400"> →</span>}
              </p>
            </>
          );
          return s.href ? (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-4 hover:border-indigo-700 transition-colors"
            >
              {inner}
            </Link>
          ) : (
            <div key={s.label} className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-4">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Create org */}
      <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Nouvelle organisation
        </h2>
        <form action={adminCreateOrg} className="flex flex-wrap gap-3 items-end">
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
            <label className="text-xs text-gray-500">Email admin (optionnel)</label>
            <input
              type="email"
              name="adminEmail"
              placeholder="admin@example.com"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-56"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Créer
          </button>
        </form>
      </div>

      {/* Org list */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {orgs.length} organisation{orgs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="divide-y divide-gray-800">
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between px-5 py-4 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="h-8 w-8 rounded text-sm font-bold flex items-center justify-center shrink-0 text-white"
                  style={{ background: org.primaryColor ?? "#6366f1" }}
                >
                  {org.name[0]?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{org.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {org._count.members} membre{org._count.members !== 1 ? "s" : ""}
                    {" · "}
                    {org._count.spaces} espace{org._count.spaces !== 1 ? "s" : ""}
                    {org.allowedEmailDomain && ` · @${org.allowedEmailDomain}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[org.subscriptionStatus] ?? STATUS_COLORS.trial}`}>
                  {STATUS_LABELS[org.subscriptionStatus] ?? org.subscriptionStatus}
                </span>
                <Link
                  href={`/admin/org/${org.id}`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                  Gérer →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

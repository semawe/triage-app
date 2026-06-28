import { requireSuperAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Link } from "@/i18n/navigation";
import { getOrgFeatures, FEATURE_LABELS, FEATURE_DEFAULTS } from "@/lib/features";
import type { FeatureKey } from "@/lib/features";
import {
  adminSetOrgSubscription,
  adminAddMember,
  adminRemoveMember,
  adminSetMemberRole,
  adminSetOrgDomain,
  adminSetOrgFeature,
} from "@/actions/admin";
import DeleteOrgButton from "./DeleteOrgButton";

const STATUS_OPTIONS = [
  { value: "trial", label: "Essai gratuit" },
  { value: "active", label: "Abonnement actif" },
  { value: "past_due", label: "Paiement en retard" },
  { value: "canceled", label: "Résilié" },
];

export default async function AdminOrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  await requireSuperAdmin();

  const { orgId } = await params;

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
      spaces: { orderBy: { createdAt: "asc" } },
      joinRequests: {
        where: { status: "pending" },
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  if (!org) notFound();

  const features = getOrgFeatures(org);

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Admin
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-xs font-medium text-red-400 bg-red-900/30 border border-red-800 rounded-full px-2.5 py-0.5">
          Super admin
        </span>
        <h1 className="text-xl font-bold text-white">{org.name}</h1>
        <code className="text-xs text-gray-600 bg-gray-800 rounded px-2 py-0.5">{org.id}</code>
      </div>

      {/* Abonnement */}
      <section className="mb-6 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Abonnement
        </h2>
        <form action={adminSetOrgSubscription} className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="orgId" value={org.id} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Statut</label>
            <select
              name="status"
              defaultValue={org.subscriptionStatus}
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Sièges</label>
            <input
              type="number"
              name="seatCount"
              defaultValue={org.seatCount}
              min={1}
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Durée d&apos;essai (jours depuis maintenant)</label>
            <input
              type="number"
              name="trialDays"
              defaultValue={30}
              min={1}
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-32"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Enregistrer
          </button>
        </form>
        {org.trialEndsAt && (
          <p className="mt-2 text-xs text-gray-400">
            Essai actuel jusqu&apos;au : {new Date(org.trialEndsAt).toLocaleDateString("fr-FR")}
          </p>
        )}
      </section>

      {/* Domaine */}
      <section className="mb-6 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Domaine email autorisé
        </h2>
        <form action={adminSetOrgDomain} className="flex flex-wrap gap-3 items-end">
          <input type="hidden" name="orgId" value={org.id} />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">@</span>
            <input
              type="text"
              name="domain"
              defaultValue={org.allowedEmailDomain ?? ""}
              placeholder="semawe.fr"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Enregistrer
          </button>
          {org.allowedEmailDomain && (
            <span className="text-xs text-green-400 self-center">✓ Actif</span>
          )}
        </form>
      </section>

      {/* Membres */}
      <section className="mb-6 rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {org.members.length} membre{org.members.length !== 1 ? "s" : ""}
          </p>
          {org.joinRequests.length > 0 && (
            <span className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded-full px-2 py-0.5">
              {org.joinRequests.length} demande{org.joinRequests.length !== 1 ? "s" : ""} en attente
            </span>
          )}
        </div>
        <div className="divide-y divide-gray-800">
          {org.members.map((m) => {
            const makeAdmin = adminSetMemberRole.bind(null, m.id, "admin");
            const makeMember = adminSetMemberRole.bind(null, m.id, "member");
            const remove = adminRemoveMember.bind(null, m.id);
            return (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{m.user.name ?? "—"}</p>
                  <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className={`rounded-full border px-2 py-0.5 font-semibold ${
                    m.role === "admin"
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                      : "border-gray-600 bg-gray-800 text-gray-300"
                  }`}>
                    {m.role === "admin" ? "Admin" : "Membre"}
                  </span>
                  {m.role === "member" ? (
                    <form action={makeAdmin}>
                      <button
                        type="submit"
                        className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
                      >
                        Passer admin
                      </button>
                    </form>
                  ) : (
                    <form action={makeMember}>
                      <button
                        type="submit"
                        className="rounded-md border border-gray-600 bg-gray-800 px-2.5 py-1 font-medium text-gray-200 hover:bg-gray-700 transition-colors"
                      >
                        Retirer admin
                      </button>
                    </form>
                  )}
                  <form action={remove}>
                    <button
                      type="submit"
                      className="rounded-md border border-red-800 bg-red-900/20 px-2.5 py-1 font-medium text-red-300 hover:bg-red-900/40 transition-colors"
                    >
                      Retirer
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
        {/* Add member */}
        <div className="border-t border-gray-800 px-5 py-4">
          <form action={adminAddMember} className="flex flex-wrap gap-3 items-end">
            <input type="hidden" name="orgId" value={org.id} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Email (compte existant)</label>
              <input
                type="email"
                name="email"
                required
                placeholder="utilisateur@domaine.fr"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-60"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Rôle</label>
              <select
                name="role"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="member">Membre</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors"
            >
              Ajouter
            </button>
          </form>
        </div>
      </section>

      {/* Espaces */}
      <section className="mb-6 rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {org.spaces.length} espace{org.spaces.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="divide-y divide-gray-800">
          {org.spaces.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-5 py-3">
              <p className="text-sm text-white">{s.name}</p>
              <span className="text-xs text-gray-600 bg-gray-800 rounded px-2 py-0.5">{s.type}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="mb-6 rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modules</p>
        </div>
        <div className="divide-y divide-gray-800">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => {
            const { label } = FEATURE_LABELS[key];
            const isOn = features[key];
            const isDefault = isOn === FEATURE_DEFAULTS[key];
            const toggle = adminSetOrgFeature.bind(null, orgId, key, !isOn);
            return (
              <div key={key} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white">{label}</p>
                  {isDefault && <span className="text-xs text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">défaut</span>}
                </div>
                <form action={toggle}>
                  <button
                    type="submit"
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isOn ? "bg-indigo-600" : "bg-gray-700"}`}
                    role="switch"
                    aria-checked={isOn}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isOn ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {/* Zone dangereuse */}
      <section className="rounded-xl bg-gray-900 border border-red-900/50 p-5">
        <h2 className="mb-3 text-xs font-semibold text-red-400 uppercase tracking-wider">
          Zone dangereuse
        </h2>
        <DeleteOrgButton orgId={org.id} orgName={org.name} />
        <p className="mt-2 text-xs text-gray-400">
          Action irréversible. Toutes les données associées (membres, espaces, réunions, outputs) seront supprimées.
        </p>
      </section>
    </AppShell>
  );
}

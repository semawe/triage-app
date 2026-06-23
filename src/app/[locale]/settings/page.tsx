import { requireOrg } from "@/lib/session";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { updateOrgBranding, updateOrgFeature, updateOrgDomain } from "@/actions/org";
import { getOrgFeatures, FEATURE_LABELS, FEATURE_DEFAULTS } from "@/lib/features";
import type { FeatureKey } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { createCheckoutSession, createCustomerPortalSession } from "@/actions/billing";
import { isOrgAccessible } from "@/lib/stripe";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trial:    { label: "Essai gratuit",        color: "text-yellow-400 bg-yellow-900/30 border-yellow-800" },
  active:   { label: "Abonnement actif",     color: "text-green-400 bg-green-900/30 border-green-800" },
  past_due: { label: "Paiement en retard",   color: "text-red-400 bg-red-900/30 border-red-800" },
  canceled: { label: "Abonnement résilié",   color: "text-gray-400 bg-gray-800 border-gray-700" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; billing?: string }>;
}) {
  const { allOrgs } = await requireOrg();

  // Only orgs where the current user is admin
  const adminOrgs = allOrgs.filter((o) => o.role === "admin");
  if (adminOrgs.length === 0) notFound();

  const { org: orgParam, billing: billingFeedback } = await searchParams;
  const targetOrgId =
    orgParam && adminOrgs.some((o) => o.id === orgParam)
      ? orgParam
      : adminOrgs[0].id;

  const org = await prisma.organisation.findUnique({ where: { id: targetOrgId } });
  if (!org) notFound();

  const features = getOrgFeatures(org);
  const memberCount = await prisma.organisationMember.count({ where: { organisationId: org.id } });
  const accessible = isOrgAccessible(org);
  const statusInfo = STATUS_LABELS[org.subscriptionStatus] ?? STATUS_LABELS.trial;

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Paramètres</h1>
          <p className="text-sm text-gray-400 mt-1">{org.name}</p>
        </div>

        {/* Org selector — only shown when admin of multiple orgs */}
        {adminOrgs.length > 1 && (
          <div className="flex rounded-lg border border-gray-800 overflow-hidden text-sm">
            {adminOrgs.map((o) => (
              <Link
                key={o.id}
                href={`/settings?org=${o.id}`}
                className={`px-4 py-2 transition-colors ${
                  o.id === targetOrgId
                    ? "bg-indigo-900/60 text-indigo-300 font-medium"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                }`}
              >
                {o.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Identité */}
      <section className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
          Identité
        </h2>
        <form action={updateOrgBranding} className="flex flex-wrap gap-5 items-end">
          <input type="hidden" name="orgId" value={org.id} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">URL du logo</label>
            <input
              type="url"
              name="logoUrl"
              defaultValue={org.logoUrl ?? ""}
              placeholder="https://example.com/logo.png"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-72"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Couleur principale</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                name="primaryColor"
                defaultValue={org.primaryColor ?? "#6366f1"}
                className="h-9 w-9 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer p-0.5"
              />
              <span className="text-xs text-gray-500">Teinte la navigation et les éléments actifs.</span>
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Enregistrer
          </button>
        </form>
      </section>

      {/* Accès par domaine */}
      <section className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Accès par domaine email
        </h2>
        <p className="text-xs text-gray-600 mb-5">
          Les utilisateurs dont l&apos;adresse se termine par ce domaine pourront demander à rejoindre l&apos;organisation. Tu valides chaque demande depuis la page Membres.
        </p>
        <form action={updateOrgDomain} className="flex flex-wrap gap-3 items-end">
          <input type="hidden" name="orgId" value={org.id} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Domaine autorisé</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-500">@</span>
              <input
                type="text"
                name="domain"
                defaultValue={org.allowedEmailDomain ?? ""}
                placeholder="semawe.fr"
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-52"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Enregistrer
          </button>
          {org.allowedEmailDomain && (
            <p className="text-xs text-green-400 self-center">
              ✓ Actif — @{org.allowedEmailDomain}
            </p>
          )}
        </form>
      </section>

      {/* Facturation */}
      <section className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Facturation</h2>

        {/* Feedback Stripe */}
        {billingFeedback === "success" && (
          <div className="mb-4 rounded-lg bg-green-900/30 border border-green-800 px-4 py-3 text-sm text-green-300">
            Abonnement activé. Merci !
          </div>
        )}
        {billingFeedback === "cancel" && (
          <div className="mb-4 rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-gray-400">
            Paiement annulé. Votre accès reste inchangé.
          </div>
        )}

        <div className="flex flex-wrap gap-6 items-start justify-between">
          <div className="space-y-3">
            {/* Statut */}
            <div className="flex items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {org.subscriptionStatus === "trial" && org.trialEndsAt && (
                <span className="text-xs text-gray-500">
                  Expire le {new Date(org.trialEndsAt).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>

            {/* Sièges */}
            <div className="text-sm text-gray-400">
              <span className="text-white font-medium">{memberCount}</span> membre{memberCount > 1 ? "s" : ""} actif{memberCount > 1 ? "s" : ""}
              {" · "}
              <span className={memberCount > org.seatCount ? "text-red-400" : "text-white font-medium"}>
                {org.seatCount}
              </span> siège{org.seatCount > 1 ? "s" : ""} inclus
              {" · "}
              <span className="text-gray-500">2 €/siège/mois</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {!accessible || org.subscriptionStatus !== "active" ? (
              <form action={createCheckoutSession.bind(null, Math.max(memberCount, org.seatCount))}>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  {org.subscriptionStatus === "trial" ? "S'abonner" : "Réactiver"}
                </button>
              </form>
            ) : org.stripeCustomerId ? (
              <form action={createCustomerPortalSession}>
                <button
                  type="submit"
                  className="rounded-lg bg-gray-800 border border-gray-700 px-5 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Gérer l&apos;abonnement
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modules actifs</h2>
          <p className="text-xs text-gray-600 mt-1">
            Active ou désactive des fonctionnalités pour toute l&apos;organisation.
            Les changements prennent effet immédiatement.
          </p>
        </div>
        <div className="divide-y divide-gray-800">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => {
            const { label, description } = FEATURE_LABELS[key];
            const isOn = features[key];
            const isDefault = isOn === FEATURE_DEFAULTS[key];
            const toggle = updateOrgFeature.bind(null, org.id, key, !isOn);

            return (
              <div key={key} className="flex items-center justify-between px-6 py-4 gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{label}</p>
                    {isDefault && (
                      <span className="text-xs text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
                        défaut
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                <form action={toggle} className="shrink-0">
                  <button
                    type="submit"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isOn ? "bg-indigo-600" : "bg-gray-700"
                    }`}
                    role="switch"
                    aria-checked={isOn}
                    title={isOn ? "Désactiver" : "Activer"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isOn ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

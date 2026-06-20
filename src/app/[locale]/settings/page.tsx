import { requireOrg } from "@/lib/session";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { updateOrgBranding, updateOrgFeature } from "@/actions/org";
import { getOrgFeatures, FEATURE_LABELS, FEATURE_DEFAULTS } from "@/lib/features";
import type { FeatureKey } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { allOrgs } = await requireOrg();

  // Only orgs where the current user is admin
  const adminOrgs = allOrgs.filter((o) => o.role === "admin");
  if (adminOrgs.length === 0) notFound();

  const { org: orgParam } = await searchParams;
  const targetOrgId =
    orgParam && adminOrgs.some((o) => o.id === orgParam)
      ? orgParam
      : adminOrgs[0].id;

  const org = await prisma.organisation.findUnique({ where: { id: targetOrgId } });
  if (!org) notFound();

  const features = getOrgFeatures(org);

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

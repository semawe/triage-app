import { requireOrg } from "@/lib/session";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { updateBillingInfo } from "@/actions/billing";

export default async function BillingInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; saved?: string; vat?: string }>;
}) {
  const { allOrgs } = await requireOrg();

  // Réservé aux admins (le contact de facturation est forcément un admin de l'org)
  const adminOrgs = allOrgs.filter((o) => o.role === "admin");
  if (adminOrgs.length === 0) notFound();

  const { org: orgParam, saved, vat } = await searchParams;
  const targetOrgId =
    orgParam && adminOrgs.some((o) => o.id === orgParam) ? orgParam : adminOrgs[0].id;

  const org = await prisma.organisation.findUnique({ where: { id: targetOrgId } });
  if (!org) notFound();

  const field =
    "rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-full";
  const labelCls = "text-xs text-gray-500";

  return (
    <AppShell>
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <Link
          href={`/settings?org=${org.id}`}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Paramètres
        </Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-2xl font-bold text-white">Coordonnées de facturation</h1>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-gray-400 leading-relaxed">
        Ces informations identifient l&apos;entité facturée pour <span className="text-white">{org.name}</span>{" "}
        et figurent sur les factures émises par Stripe. Un seul jeu de coordonnées par
        organisation ; seuls les admins peuvent les modifier.
      </p>

      {saved && (
        <div className="mb-6 rounded-lg bg-green-900/30 border border-green-800 px-4 py-3 text-sm text-green-300">
          Coordonnées enregistrées.
          {vat === "invalid" && (
            <span className="block text-yellow-300 mt-1">
              Le n° de TVA a été enregistré localement mais refusé par Stripe (format invalide) —
              vérifie-le pour qu&apos;il apparaisse sur la facture.
            </span>
          )}
        </div>
      )}

      <form action={updateBillingInfo} className="max-w-2xl space-y-6">
        <input type="hidden" name="org" value={org.id} />

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Identité</h2>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Raison sociale facturée</label>
            <input
              type="text"
              name="billingName"
              defaultValue={org.billingName ?? ""}
              placeholder={org.name}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Email de facturation</label>
            <input
              type="email"
              name="billingEmail"
              defaultValue={org.billingEmail ?? ""}
              placeholder="facturation@exemple.fr"
              className={field}
            />
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Adresse</h2>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Adresse</label>
            <input
              type="text"
              name="billingAddressLine1"
              defaultValue={org.billingAddressLine1 ?? ""}
              placeholder="N° et rue"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Complément (optionnel)</label>
            <input
              type="text"
              name="billingAddressLine2"
              defaultValue={org.billingAddressLine2 ?? ""}
              placeholder="Bâtiment, étage…"
              className={field}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Code postal</label>
              <input
                type="text"
                name="billingPostalCode"
                defaultValue={org.billingPostalCode ?? ""}
                placeholder="38100"
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Ville</label>
              <input
                type="text"
                name="billingCity"
                defaultValue={org.billingCity ?? ""}
                placeholder="Grenoble"
                className={field}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Pays (code ISO)</label>
            <input
              type="text"
              name="billingCountry"
              defaultValue={org.billingCountry ?? "FR"}
              placeholder="FR"
              maxLength={2}
              className={`${field} w-24 uppercase`}
            />
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Données fiscales</h2>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>SIRET</label>
            <input
              type="text"
              name="siret"
              defaultValue={org.siret ?? ""}
              placeholder="123 456 789 00012"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>N° de TVA intracommunautaire</label>
            <input
              type="text"
              name="vatNumber"
              defaultValue={org.vatNumber ?? ""}
              placeholder="FR12345678901"
              className={field}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </AppShell>
  );
}

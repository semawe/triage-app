import { requireOrgForBilling } from "@/lib/session";
import { getTranslations } from "next-intl/server";
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
  const { allOrgs } = await requireOrgForBilling();
  const t = await getTranslations("billingInfo");

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
    <AppShell allowSuspended>
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <Link
          href={`/settings?org=${org.id}`}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {t("backSettings")}
        </Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-gray-400 leading-relaxed">
        {t("intro", { org: org.name })}
      </p>

      {saved && (
        <div className="mb-6 rounded-lg bg-green-900/30 border border-green-800 px-4 py-3 text-sm text-green-300">
          {t("saved")}
          {vat === "invalid" && (
            <span className="block text-yellow-300 mt-1">
              {t("vatInvalid")}
            </span>
          )}
        </div>
      )}

      <form action={updateBillingInfo} className="max-w-2xl space-y-6">
        {/* L'organisation visée vient de l'écran, jamais du cookie d'org active. */}
        <input type="hidden" name="orgId" value={org.id} />
        <input type="hidden" name="org" value={org.id} />

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("identity")}</h2>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("legalName")}</label>
            <input
              type="text"
              name="billingName"
              defaultValue={org.billingName ?? ""}
              placeholder={org.name}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("contactName")}</label>
            <input
              type="text"
              name="billingContactName"
              defaultValue={org.billingContactName ?? ""}
              placeholder={t("contactPlaceholder")}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("email")}</label>
            <input
              type="email"
              name="billingEmail"
              defaultValue={org.billingEmail ?? ""}
              placeholder={t("emailPlaceholder")}
              className={field}
            />
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("address")}</h2>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("street")}</label>
            <input
              type="text"
              name="billingAddressLine1"
              defaultValue={org.billingAddressLine1 ?? ""}
              placeholder={t("streetPlaceholder")}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("complement")}</label>
            <input
              type="text"
              name="billingAddressLine2"
              defaultValue={org.billingAddressLine2 ?? ""}
              placeholder={t("complementPlaceholder")}
              className={field}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("postalCode")}</label>
              <input
                type="text"
                name="billingPostalCode"
                defaultValue={org.billingPostalCode ?? ""}
                placeholder={t("postalCodePlaceholder")}
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("city")}</label>
              <input
                type="text"
                name="billingCity"
                defaultValue={org.billingCity ?? ""}
                placeholder={t("cityPlaceholder")}
                className={field}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("country")}</label>
            <input
              type="text"
              name="billingCountry"
              defaultValue={org.billingCountry ?? "FR"}
              placeholder={t("countryPlaceholder")}
              maxLength={2}
              className={`${field} w-24 uppercase`}
            />
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("taxData")}</h2>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("siret")}</label>
            <input
              type="text"
              name="siret"
              defaultValue={org.siret ?? ""}
              placeholder={t("siretPlaceholder")}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("vat")}</label>
            <input
              type="text"
              name="vatNumber"
              defaultValue={org.vatNumber ?? ""}
              placeholder={t("vatPlaceholder")}
              className={field}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            {t("save")}
          </button>
        </div>
      </form>
    </AppShell>
  );
}

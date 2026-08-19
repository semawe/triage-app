import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createOrg } from "@/actions/org";
import { Link } from "@/i18n/navigation";

export default async function SetupPage() {
  const session = await auth();
  const locale = await getLocale().catch(() => "fr");
  const t = await getTranslations("setup");

  if (!session?.user?.id) redirect(`/${locale}/login`);

  const existing = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) redirect(`/${locale}/meetings`);

  // Retour de test #29 : éviter les doublons d'organisation. Avant de proposer la
  // création, chercher les organisations dont le domaine email autorisé correspond
  // à l'adresse de l'utilisateur — il les rejoint plutôt que d'en recréer une.
  const email = session.user.email ?? "";
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const matchingOrgs = domain
    ? await prisma.organisation.findMany({
        where: { allowedEmailDomain: domain },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        {matchingOrgs.length > 0 ? (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">{t("joinTitle")}</h1>
              <p className="mt-2 text-sm text-gray-400">
                {matchingOrgs.length > 1
                  ? t("joinIntroMany", { email })
                  : t("joinIntroOne", { email })}
              </p>
            </div>

            <div className="space-y-2">
              {matchingOrgs.map((org) => (
                <Link
                  key={org.id}
                  href={`/join-request?orgId=${org.id}`}
                  className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 hover:border-indigo-700 transition-colors"
                >
                  <span className="text-sm font-medium text-white">{org.name}</span>
                  <span className="text-xs text-indigo-400">{t("askToJoin")}</span>
                </Link>
              ))}
            </div>

            <div className="border-t border-gray-800 pt-6">
              <p className="mb-3 text-center text-xs text-gray-500">
                {t("noneMatches")}
              </p>
              <form action={createOrg} className="space-y-3">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder={t("newOrgPlaceholder")}
                  className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-gray-700 px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-800 transition-colors"
                >
                  {t("createAnother")}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">{t("createTitle")}</h1>
              <p className="mt-2 text-sm text-gray-400">
                {t("createIntro")}
              </p>
            </div>

            <form action={createOrg} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
                  {t("orgNameLabel")}
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  autoFocus
                  placeholder={t("orgNamePlaceholder")}
                  className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                Créer et continuer →
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

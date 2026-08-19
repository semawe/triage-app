import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function MentionsLegalesPage() {
  const t = await getTranslations("legal");
  // Les données d'identification de la société ne se traduisent pas : elles sont
  // opposables telles quelles. Seuls les libellés qui les introduisent le sont.
  const SOCIETE = {
    capital: "38 000 €",
    adresse: "1 rue des Pins, 38100 Grenoble",
    siren: "108 072 919",
    ville: "Grenoble",
    tva: "FR 52 108 072 919",
  };
  const HEBERGEUR_ADRESSE = "2 rue Kellermann, 59100 Roubaix, France";
  const EMAIL_CONTACT = "contact@heterostasia.com";
  const LIEN = "text-indigo-400 hover:text-indigo-300 transition-colors";
  const HEBERGEUR_SITE = "www.ovh.com";
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-6 py-5 max-w-3xl mx-auto">
        <Link href="/" className="text-lg font-bold tracking-tight">
          tri<span className="text-indigo-400">app</span>
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-10">{t("title")}</h1>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            {t("publisher")}
          </h2>
          <div className="text-sm text-gray-300 space-y-1">
            <p className="font-medium text-white">Heterostasia</p>
            <p>
              {t("legalForm", { capital: SOCIETE.capital })}
            </p>
            <p>{t("registeredOffice", { address: SOCIETE.adresse })}</p>
            <p>{t("registration", { siren: SOCIETE.siren, city: SOCIETE.ville })}</p>
            <p>{t("vat", { vat: SOCIETE.tva })}</p>
            <p>
              {t("contact")}{" "}
              <a href={`mailto:${EMAIL_CONTACT}`} className={LIEN}>
                {EMAIL_CONTACT}
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            {t("publicationDirector")}
          </h2>
          <p className="text-sm text-gray-300">
            {t("publicationDirectorValue")}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            {t("hosting")}
          </h2>
          <div className="text-sm text-gray-300 space-y-1">
            <p className="font-medium text-white">OVH SAS</p>
            <p>{t("hostAddress", { address: HEBERGEUR_ADRESSE })}</p>
            <p>
              <a
                href="https://www.ovh.com"
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                {HEBERGEUR_SITE}
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            {t("personalData")}
          </h2>
          {/* Phrase riche : la traduction porte la phrase entière et décide où le lien
              se place. Découpée en fragments de JSX, elle imposerait l'ordre des mots
              du français à toutes les langues. */}
          <p className="text-sm text-gray-300 leading-relaxed">
            {t.rich("personalDataBody", {
              contact: () => (
                <a href={`mailto:${EMAIL_CONTACT}`} className={LIEN}>
                  {EMAIL_CONTACT}
                </a>
              ),
            })}
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            {t("licence")}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            {t.rich("licenceBody", {
              licence: (chunks) => (
                <a
                  href="https://www.gnu.org/licenses/agpl-3.0.fr.html"
                  className={LIEN}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
              repo: (chunks) => (
                <a
                  href="https://github.com/semawe/triage-app"
                  className={LIEN}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </section>

        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          {t("back")}
        </Link>
      </main>
    </div>
  );
}

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
            Éditeur du site
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
              <a
                href="mailto:contact@heterostasia.com"
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                contact@heterostasia.com
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Directeur de la publication
          </h2>
          <p className="text-sm text-gray-300">
            Aliocha Iordanoff, représentant de La Fabrique des Alpes,
            présidente de Heterostasia
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Hébergement
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
                www.ovh.com
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Données personnelles
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Les données collectées (adresse email, nom) sont utilisées
            exclusivement pour l&apos;authentification et le fonctionnement du
            service. Elles ne sont ni vendues ni transmises à des tiers. Vous
            pouvez demander leur suppression en écrivant à{" "}
            <a
              href="mailto:contact@heterostasia.com"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              contact@heterostasia.com
            </a>
            .
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Licence
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Le code source de triapp est publié sous licence{" "}
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.fr.html"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              AGPL-3.0
            </a>
            . Le dépôt est accessible sur{" "}
            <a
              href="https://github.com/semawe/triage-app"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </section>

        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Retour
        </Link>
      </main>
    </div>
  );
}

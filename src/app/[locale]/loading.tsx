/**
 * État de chargement partagé par les pages de `[locale]`.
 *
 * Il n'en existait aucun : chaque navigation laissait l'écran précédent figé sans
 * signe de vie, et un rafraîchissement du flux temps réel ne se voyait pas du tout
 * (revue adverse du 18/08/2026). En réunion, un facilitateur qui ne sait pas si son
 * clic a été pris clique deux fois.
 */
import { getTranslations } from "next-intl/server";

export default async function Chargement() {
  const t = await getTranslations("app");
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 items-center justify-center py-24"
    >
      <span className="sr-only">{t("loading")}</span>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
    </div>
  );
}

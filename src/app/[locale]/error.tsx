"use client";

import { Link } from "@/i18n/navigation";

/**
 * Frontière d'erreur des pages de `[locale]`.
 *
 * Sans elle, une erreur non rattrapée servait l'écran d'erreur générique de Next,
 * sans issue autre que le bouton « retour » du navigateur. Une réunion en cours n'a
 * pas de temps pour ça : on nomme ce qui s'est passé et on propose de réessayer sans
 * perdre la page.
 */
export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-3xl">⚠️</p>
      <h1 className="text-xl font-bold text-white">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="max-w-md text-sm text-gray-400">
        L&apos;erreur a été enregistrée. Réessayer suffit le plus souvent ; si elle revient,
        la référence ci-dessous aide à la retrouver.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-gray-600">référence {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Réessayer
        </button>
        <Link
          href="/me"
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Revenir à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

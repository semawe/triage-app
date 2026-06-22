import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";

export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/meetings");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <span className="text-lg font-bold tracking-tight">
          tri<span className="text-indigo-400">app</span>
        </span>
        <Link
          href="/login"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Se connecter
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-4">
          Facilitation de réunion
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight mb-6">
          Des réunions qui avancent,<br className="hidden sm:block" /> vraiment.
        </h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
          triapp structure vos réunions d&apos;équipe&nbsp;: agenda partagé, traitement point par
          point, outputs enregistrés. Conçu pour les équipes auto-organisées, compatible
          Holacracy.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/login"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold transition-colors"
          >
            Commencer — 14 jours gratuits
          </Link>
          <a
            href="#tarifs"
            className="rounded-lg border border-gray-700 hover:border-gray-500 px-6 py-3 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Voir les tarifs
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <FeatureCard
            icon="◈"
            title="Agenda collaboratif"
            description="Chaque membre ajoute ses points avant la réunion. L'ordre se construit ensemble, en temps réel."
          />
          <FeatureCard
            icon="◎"
            title="Traitement structuré"
            description="Un point à la fois. Notes, actions, décisions, projets, gouvernance — chaque output est typé et daté."
          />
          <FeatureCard
            icon="◉"
            title="Multi-espaces"
            description="Cercles, équipes ou projets. Chaque espace a ses réunions, ses membres, sa hiérarchie."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="tarifs" className="max-w-5xl mx-auto px-6 pb-28">
        <h2 className="text-2xl font-bold text-center mb-12">Tarifs</h2>
        <div className="max-w-sm mx-auto rounded-2xl border border-gray-800 bg-gray-950 p-8">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-2">
            Standard
          </p>
          <p className="text-4xl font-bold mb-1">
            2 <span className="text-2xl">€</span>
          </p>
          <p className="text-sm text-gray-500 mb-8">par utilisateur / mois</p>
          <ul className="space-y-3 text-sm text-gray-400 mb-8">
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-0.5">✓</span>
              Essai gratuit 14 jours, sans carte bancaire
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-0.5">✓</span>
              Réunions illimitées
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-0.5">✓</span>
              Espaces et cercles illimités
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-0.5">✓</span>
              Open source — AGPL-3.0
            </li>
          </ul>
          <Link
            href="/login"
            className="block w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold text-center transition-colors"
          >
            Commencer gratuitement
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-900 max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-4">
        <span>
          tri<span className="text-indigo-700">app</span> — par{" "}
          <a
            href="https://heterostasia.com"
            className="hover:text-gray-400 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Heterostasia
          </a>
        </span>
        <span>Licence AGPL-3.0 — open source</span>
        <Link
          href="/mentions-legales"
          className="hover:text-gray-400 transition-colors"
        >
          Mentions légales
        </Link>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-6">
      <span className="text-2xl text-indigo-400 mb-4 block">{icon}</span>
      <h3 className="font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

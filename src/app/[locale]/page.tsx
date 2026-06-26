import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "triapp — Facilitation de réunion Holacracy",
  description:
    "Agenda partagé en temps réel, traitement point par point, outputs typés. L'outil de réunion pour équipes auto-organisées. Open source, essai gratuit 14 jours.",
  openGraph: {
    title: "triapp — Des réunions qui avancent, vraiment.",
    description:
      "Agenda partagé en temps réel, traitement structuré, outputs typés. Compatible Holacracy.",
    url: "https://triapp.fr",
    siteName: "triapp",
    locale: "fr_FR",
    type: "website",
  },
};

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
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
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
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-7 py-3.5 text-sm font-semibold transition-colors shadow-lg shadow-indigo-950"
          >
            Essayer gratuitement — 14 jours
          </Link>
          <a
            href="#tarifs"
            className="rounded-lg border border-gray-700 hover:border-gray-500 px-6 py-3.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Voir les tarifs
          </a>
        </div>
      </section>

      {/* App mock */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <AppMock />
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

      {/* Social proof */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-gray-800 bg-gray-950 px-8 py-10 flex flex-col sm:flex-row items-start gap-8">
          <div className="shrink-0">
            <div className="h-12 w-12 rounded-xl bg-indigo-900/40 border border-indigo-800/40 flex items-center justify-center text-xl text-indigo-400">
              ◎
            </div>
          </div>
          <div>
            <p className="text-base text-gray-300 leading-relaxed mb-4">
              &ldquo;Nos triages hebdomadaires ont enfin un fil conducteur. Les outputs sont là,
              tracés, sans effort supplémentaire en fin de séance.&rdquo;
            </p>
            <p className="text-sm text-gray-600">
              Aliocha Iordanoff — co-fondateur,{" "}
              <a
                href="https://semawe.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors"
              >
                Sémawé
              </a>{" "}
              &middot; premier utilisateur de triapp
            </p>
          </div>
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
            2 <span className="text-2xl">€</span> <span className="text-2xl">TTC</span>
          </p>
          <p className="text-sm text-gray-500 mb-8">par utilisateur / mois · TVA incluse</p>
          <ul className="space-y-3 text-sm text-gray-400 mb-8">
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-0.5">✓</span>
              Prix tout compris (TTC), sans TVA en supplément
            </li>
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
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/semawe/triage-app"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            GitHub
          </a>
          <span className="text-gray-800">·</span>
          <span>AGPL-3.0</span>
        </div>
        <Link href="/mentions-legales" className="hover:text-gray-400 transition-colors">
          Mentions légales
        </Link>
      </footer>
    </div>
  );
}

function AppMock() {
  return (
    <div className="rounded-2xl border border-gray-800 overflow-hidden shadow-2xl shadow-black/60 select-none">
      {/* App nav */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111] border-b border-gray-800">
        <span className="text-sm font-bold tracking-tight text-white">
          tri<span className="text-indigo-400">app</span>
        </span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-xs text-gray-500">Sémawé / Cercle principal</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">En cours</span>
        </div>
      </div>

      {/* Meeting header */}
      <div className="bg-[#0d0d0d] px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-600 mb-0.5">Triage hebdomadaire</p>
          <p className="text-sm font-semibold text-white">Mercredi 18 juin 2025, 10h00</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-mono font-semibold text-white">12:47</p>
          <p className="text-xs text-gray-600">restant</p>
        </div>
      </div>

      {/* Agenda items */}
      <div className="bg-[#0d0d0d] divide-y divide-gray-900/70">
        <MockAgendaItem
          status="done"
          number={1}
          title="Indicateurs clés"
          initials="A"
          avatarClass="bg-indigo-700"
        />
        <MockAgendaItem
          status="active"
          number={2}
          title="Recrutement — prochaine étape"
          initials="J"
          avatarClass="bg-purple-700"
          output={{ type: "action", text: "@Juliette — préparer le brief RH avant le 25/06" }}
        />
        <MockAgendaItem
          status="pending"
          number={3}
          title="Budget Q3 — décision"
          initials="S"
          avatarClass="bg-emerald-700"
        />
        <MockAgendaItem
          status="pending"
          number={4}
          title="Point partenariat Novalis"
          initials="A"
          avatarClass="bg-indigo-700"
        />
      </div>
    </div>
  );
}

function MockAgendaItem({
  status,
  number,
  title,
  initials,
  avatarClass,
  output,
}: {
  status: "done" | "active" | "pending";
  number: number;
  title: string;
  initials: string;
  avatarClass: string;
  output?: { type: string; text: string };
}) {
  const isDone = status === "done";
  const isActive = status === "active";

  return (
    <div
      className={`px-5 py-3 ${isActive ? "bg-indigo-950/25" : ""}`}
      style={isActive ? { borderLeft: "2px solid #6366f1" } : { borderLeft: "2px solid transparent" }}
    >
      <div className="flex items-center gap-3">
        <span
          className={`text-xs w-5 text-center shrink-0 font-mono ${
            isDone ? "text-emerald-500" : isActive ? "text-indigo-400 font-bold" : "text-gray-700"
          }`}
        >
          {isDone ? "✓" : number}
        </span>
        <div
          className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${avatarClass} ${isDone ? "opacity-40" : ""}`}
        >
          {initials}
        </div>
        <p
          className={`text-sm flex-1 min-w-0 truncate ${
            isDone
              ? "text-gray-600 line-through"
              : isActive
              ? "text-white font-medium"
              : "text-gray-500"
          }`}
        >
          {title}
        </p>
        {isActive && (
          <span className="text-xs text-indigo-400 font-medium shrink-0">→ En cours</span>
        )}
      </div>
      {output && (
        <div className="mt-2 ml-14 flex items-start gap-2">
          <span className="text-xs rounded-full bg-sky-900/50 border border-sky-800/40 text-sky-300 px-2 py-0.5 shrink-0">
            {output.type}
          </span>
          <span className="text-xs text-gray-500 leading-5">{output.text}</span>
        </div>
      )}
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

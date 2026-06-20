"use client";

import { useState } from "react";

const PISTES = [
  {
    key: "action",
    label: "Action suivante",
    color: "text-blue-300",
    dot: "bg-blue-500",
    question: "Quelle est la prochaine action physique et visible ?",
    tactique:
      "Un verbe + une chose tangible. Qui fait quoi, concrètement ? Si plusieurs personnes doivent agir, créer une action par personne.",
  },
  {
    key: "project",
    label: "Projet",
    color: "text-orange-300",
    dot: "bg-orange-500",
    question: "Le résultat demande-t-il plus d'une action ?",
    tactique:
      "Formuler le résultat désiré (ex. « Contrat signé »), puis identifier la première action suivante du projet.",
  },
  {
    key: "waiting",
    label: "En attente de…",
    color: "text-yellow-300",
    dot: "bg-yellow-500",
    question: "Attends-tu quelque chose d'une personne précise ?",
    tactique:
      "Noter : qui, quoi, depuis quand. Planifier une relance si l'échéance est connue.",
  },
  {
    key: "someday",
    label: "Un jour / Peut-être",
    color: "text-purple-300",
    dot: "bg-purple-500",
    question: "Bonne idée, mais pas maintenant ?",
    tactique:
      "À revoir lors de la prochaine revue hebdomadaire ou de gouvernance. Pas d'engagement.",
  },
  {
    key: "reference",
    label: "Référence",
    color: "text-gray-300",
    dot: "bg-gray-500",
    question: "Information utile, sans action associée ?",
    tactique:
      "Archiver à un endroit de confiance. Rien à faire — la tension est résolue par la connaissance.",
  },
  {
    key: "trash",
    label: "Classer sans suite",
    color: "text-red-300",
    dot: "bg-red-600",
    question: "Rien à faire, rien à garder ?",
    tactique:
      "On laisse tomber explicitement. La tension est résolue par la décision de ne rien faire.",
  },
] as const;

const TACTIQUES_HOLACRACY = [
  { label: "Demande d'info", desc: "« Qui sait quelque chose sur… ? »" },
  { label: "Demande de ressource", desc: "« J'ai besoin de X pour Y. »" },
  { label: "Partage d'info", desc: "« Je voulais que vous sachiez que… »" },
  { label: "Coordination", desc: "« J'ai besoin que le rôle X fasse Y. »" },
  { label: "Délégation", desc: "« Qui peut décider de X ? »" },
] as const;

type Tab = "pistes" | "tactiques";

export default function PistesPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("pistes");

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300 hover:border-gray-700 hover:text-white transition-colors whitespace-nowrap"
        title="Pistes de traitement"
      >
        <span className="text-xs">{open ? "▶" : "◀"}</span>
        <span className="font-medium">Pistes</span>
      </button>

      {open && (
        <div className="mt-2 w-64 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setTab("pistes")}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tab === "pistes"
                  ? "text-white border-b-2 border-indigo-500 -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Pistes GTD
            </button>
            <button
              onClick={() => setTab("tactiques")}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tab === "tactiques"
                  ? "text-white border-b-2 border-indigo-500 -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Tactiques
            </button>
          </div>

          {tab === "pistes" && (
            <div className="p-4 space-y-4">
              {PISTES.map((p) => (
                <div key={p.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${p.dot}`} />
                    <p className={`text-sm font-semibold ${p.color}`}>{p.label}</p>
                  </div>
                  <p className="pl-4 text-xs text-gray-400 italic">{p.question}</p>
                  <p className="pl-4 text-xs text-gray-500">{p.tactique}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "tactiques" && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                En réunion tactique Holacracy, le titulaire d&apos;un point exprime
                sa tension. Voici les modes d&apos;interaction possibles :
              </p>
              {TACTIQUES_HOLACRACY.map((t) => (
                <div key={t.label} className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-200">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

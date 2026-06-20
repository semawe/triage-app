"use client";

import { useState } from "react";

const PISTES = [
  { key: "next_action", label: "Action suivante", desc: "Prochaine action physique visible" },
  { key: "project", label: "Projet", desc: "Résultat multi-étapes" },
  { key: "waiting_for", label: "En attente de…", desc: "Délégué, on attend une réponse" },
  { key: "someday_maybe", label: "Un jour peut-être", desc: "Bonne idée, pas maintenant" },
  { key: "reference", label: "Référence", desc: "Information à archiver" },
  { key: "trash", label: "À abandonner", desc: "Pas d'action, on laisse tomber" },
] as const;

export default function PistesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300 hover:border-gray-700 hover:text-white transition-colors whitespace-nowrap"
        title="Pistes de traitement"
      >
        <span>{open ? "▶" : "◀"}</span>
        <span className="font-medium">Pistes</span>
      </button>

      {open && (
        <div className="mt-2 w-56 rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Pistes de traitement
          </p>
          {PISTES.map((p) => (
            <div key={p.key} className="space-y-0.5">
              <p className="text-sm font-medium text-gray-200">{p.label}</p>
              <p className="text-xs text-gray-500">{p.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

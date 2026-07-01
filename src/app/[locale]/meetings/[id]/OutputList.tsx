"use client";

import { useState, useTransition } from "react";

export type OutputRow = {
  id: string;
  type: string;
  content: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null; // "YYYY-MM-DD" ou null
};

type Member = { userId: string; name: string };

const TYPE_COLORS: Record<string, string> = {
  note: "bg-gray-700 text-gray-300",
  action: "bg-blue-900 text-blue-300",
  decision: "bg-purple-900 text-purple-300",
  project: "bg-orange-900 text-orange-300",
  governance: "bg-pink-900 text-pink-300",
};

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  action: "Action",
  decision: "Décision",
  project: "Projet",
  governance: "Gouvernance",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[type] ?? "bg-gray-700 text-gray-300"}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

/**
 * Liste des outputs du point actif. Réservé au scribe (retour #32) : édition
 * inline (type, assigné, échéance, contenu) et suppression d'un output déjà
 * enregistré, pour corriger une erreur sans avoir à ressaisir.
 */
export default function OutputList({
  outputs,
  members,
  showActions,
  showProjects,
  showGovernance,
  canEdit,
  updateOutput,
  deleteOutput,
}: {
  outputs: OutputRow[];
  members: Member[];
  showActions: boolean;
  showProjects: boolean;
  showGovernance: boolean;
  canEdit: boolean;
  updateOutput: (outputId: string, formData: FormData) => Promise<void>;
  deleteOutput: (outputId: string) => Promise<void>;
}) {
  if (outputs.length === 0) return null;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
      {outputs.map((o) => (
        <OutputItem
          key={o.id}
          output={o}
          members={members}
          showActions={showActions}
          showProjects={showProjects}
          showGovernance={showGovernance}
          canEdit={canEdit}
          updateOutput={updateOutput}
          deleteOutput={deleteOutput}
        />
      ))}
    </div>
  );
}

function OutputItem({
  output,
  members,
  showActions,
  showProjects,
  showGovernance,
  canEdit,
  updateOutput,
  deleteOutput,
}: {
  output: OutputRow;
  members: Member[];
  showActions: boolean;
  showProjects: boolean;
  showGovernance: boolean;
  canEdit: boolean;
  updateOutput: (outputId: string, formData: FormData) => Promise<void>;
  deleteOutput: (outputId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(output.content);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(formData) => {
          if (!content.trim()) return;
          startTransition(async () => {
            await updateOutput(output.id, formData);
            setEditing(false);
          });
        }}
        className="rounded-lg border border-indigo-900 bg-gray-950/40 p-3 space-y-3"
      >
        <div className="flex gap-3 flex-wrap">
          <select
            name="type"
            defaultValue={output.type}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="note">Note</option>
            {showActions && <option value="action">Action</option>}
            <option value="decision">Décision</option>
            {showProjects && <option value="project">Projet</option>}
            {showGovernance && <option value="governance">Gouvernance</option>}
          </select>
          <select
            name="assigneeId"
            defaultValue={output.assigneeId ?? ""}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">Assigné (optionnel)</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dueDate"
            defaultValue={output.dueDate ?? ""}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <textarea
          name="content"
          required
          rows={2}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending || !content.trim()}
            className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm text-white hover:bg-indigo-600 transition-colors disabled:opacity-50"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setContent(output.content);
              setEditing(false);
            }}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Annuler
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-3 items-start group">
      <TypeBadge type={output.type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{output.content}</p>
        {(output.assigneeName || output.dueDate) && (
          <p className="text-xs text-gray-500 mt-0.5">
            {output.assigneeName && `→ ${output.assigneeName}`}
            {output.dueDate && ` · ${new Date(output.dueDate).toLocaleDateString("fr-FR")}`}
          </p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Modifier"
            className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            ✎
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Supprimer cet output ?")) return;
              startTransition(async () => {
                await deleteOutput(output.id);
              });
            }}
            title="Supprimer"
            className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-red-900/40 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

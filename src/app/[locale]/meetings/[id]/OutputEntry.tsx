"use client";

import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";

/**
 * Coordination de l'état « note non enregistrée » entre la zone de saisie d'output
 * et les boutons de navigation (point suivant / clore / saut vers un point).
 *
 * Retour de test #28 : le texte saisi dans une output mais non enregistré
 * (a) se traînait sur le point suivant (textarea non contrôlé réconcilié au même
 * endroit), et (b) pouvait être perdu silencieusement en changeant de point.
 * On réinitialise la saisie à chaque point (clé sur itemId, plus bas) et on
 * avertit avant de quitter un point avec une note en cours.
 */
const UnsavedOutputContext = createContext<{
  dirty: boolean;
  setDirty: (b: boolean) => void;
}>({ dirty: false, setDirty: () => {} });

export function UnsavedOutputProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return (
    <UnsavedOutputContext.Provider value={{ dirty, setDirty }}>
      {children}
    </UnsavedOutputContext.Provider>
  );
}

/**
 * Remplace un <form action={serverAction}> de navigation : si une note est en
 * cours de saisie, demande confirmation avant de quitter le point.
 */
export function GuardedNavForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const { dirty } = useContext(UnsavedOutputContext);
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (
          dirty &&
          !confirm(
            "Une note est saisie mais non enregistrée pour ce point. Quitter sans l'enregistrer ?",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}

type Member = { userId: string; name: string };

/**
 * Zone de saisie d'un output. Composant client monté avec une clé = itemId
 * (côté page), donc l'état se réinitialise à chaque changement de point.
 */
export function OutputEntry({
  addOutput,
  itemId,
  showActions,
  showProjects,
  showGovernance,
  members,
}: {
  addOutput: (formData: FormData) => Promise<void>;
  itemId: string;
  showActions: boolean;
  showProjects: boolean;
  showGovernance: boolean;
  members: Member[];
}) {
  const { setDirty } = useContext(UnsavedOutputContext);
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!content.trim()) return;
        startTransition(async () => {
          await addOutput(formData);
          setContent("");
          setDirty(false);
        });
      }}
      className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex gap-3 flex-wrap">
        <select
          name="type"
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
          className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        />
      </div>
      <textarea
        name="content"
        required
        rows={2}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(e.target.value.trim().length > 0);
        }}
        placeholder="Saisir l'output…"
        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !content.trim()}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-indigo-700 hover:text-white transition-colors disabled:opacity-50 disabled:hover:bg-gray-700 disabled:hover:text-gray-200"
        >
          {pending ? "Enregistrement…" : "Ajouter l'output"}
        </button>
        {content.trim() && !pending && (
          <span className="text-xs text-yellow-500/80">Note non enregistrée</span>
        )}
      </div>
    </form>
  );
}

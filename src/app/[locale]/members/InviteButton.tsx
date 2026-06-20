"use client";

import { useActionState, useEffect, useRef } from "react";
import { generateInvite } from "@/actions/member";

type State = { url: string } | null;

export default function InviteButton() {
  const [state, action, pending] = useActionState<State, FormData>(
    generateInvite,
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.url && inputRef.current) {
      inputRef.current.select();
      navigator.clipboard.writeText(state.url).catch(() => {});
    }
  }, [state?.url]);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rôle de l&apos;invité</label>
          <select
            name="role"
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="member">Membre</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {pending ? "Génération…" : "Générer un lien d'invitation"}
        </button>
      </form>

      {state?.url && (
        <div className="space-y-1.5">
          <p className="text-xs text-emerald-400">✓ Lien copié dans le presse-papier — valable 7 jours</p>
          <input
            ref={inputRef}
            readOnly
            value={state.url}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-300 focus:outline-none select-all"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
        </div>
      )}
    </div>
  );
}

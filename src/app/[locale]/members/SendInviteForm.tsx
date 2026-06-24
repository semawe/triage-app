"use client";

import { useActionState } from "react";
import { sendInviteByEmail } from "@/actions/member";

type State = { ok: boolean; error?: string } | null;

export default function SendInviteForm() {
  const [state, action, pending] = useActionState<State, FormData>(
    sendInviteByEmail,
    null
  );

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            name="email"
            required
            placeholder="prenom@domaine.fr"
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Rôle</label>
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
          {pending ? "Envoi…" : "Envoyer l'invitation"}
        </button>
      </form>

      {state?.ok && (
        <p className="text-xs text-emerald-400">✓ Invitation envoyée — lien valable 7 jours.</p>
      )}
      {state && !state.ok && state.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
    </div>
  );
}

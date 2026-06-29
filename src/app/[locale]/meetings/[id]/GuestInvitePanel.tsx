"use client";

import { useActionState, useState } from "react";
import { inviteGuestToMeeting, revokeGuest } from "@/actions/guest";

type Guest = {
  id: string;
  email: string;
  name: string | null;
  entered: boolean;
  link: string;
};

export default function GuestInvitePanel({
  meetingId,
  guests,
}: {
  meetingId: string;
  guests: Guest[];
}) {
  const invite = inviteGuestToMeeting.bind(null, meetingId);
  const [state, formAction, pending] = useActionState(invite, null);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Invités ponctuels
        </p>
      </div>

      {guests.length > 0 && (
        <div className="divide-y divide-gray-800">
          {guests.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{g.name ?? g.email}</p>
                <p className="text-xs text-gray-500 truncate">
                  {g.email}
                  {g.entered ? " · a rejoint" : " · invité, pas encore entré"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(g.link);
                    setCopied(g.id);
                    setTimeout(() => setCopied((c) => (c === g.id ? null : c)), 1500);
                  }}
                  className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {copied === g.id ? "Copié ✓" : "Copier le lien"}
                </button>
                <form action={revokeGuest.bind(null, meetingId, g.id)}>
                  <button
                    type="submit"
                    className="rounded-md border border-red-800 bg-red-900/20 px-2.5 py-1 text-red-300 hover:bg-red-900/40 transition-colors"
                  >
                    Révoquer
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-800 px-5 py-4">
        <form action={formAction} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Email de l&apos;invité</label>
            <input
              type="email"
              name="email"
              required
              placeholder="invite@exemple.fr"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Nom (optionnel)</label>
            <input
              type="text"
              name="name"
              placeholder="Prénom Nom"
              className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Inviter"}
          </button>
        </form>
        {state?.ok && (
          <p className="mt-2 text-xs text-green-400">Invitation envoyée.</p>
        )}
        {state && !state.ok && state.error && (
          <p className="mt-2 text-xs text-yellow-400">{state.error}</p>
        )}
        <p className="mt-2 text-xs text-gray-600">
          L&apos;invité peut suivre la réunion, ajouter des points et recevoir le compte-rendu —
          sans compte ni accès au reste de l&apos;organisation.
        </p>
      </div>
    </section>
  );
}

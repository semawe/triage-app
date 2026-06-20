"use client";

import { useActionState, useCallback } from "react";
import { sendMeetingRecap } from "@/actions/email";

type State = { ok: boolean; error?: string } | null;

export default function SendRecapButton({
  meetingId,
  recapText,
}: {
  meetingId: string;
  recapText: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    sendMeetingRecap,
    null
  );

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(recapText);
  }, [recapText]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {state?.ok ? (
          <p className="text-sm text-emerald-400">✓ Compte-rendu envoyé</p>
        ) : (
          <form action={action}>
            <input type="hidden" name="meetingId" value={meetingId} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-indigo-600 hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              {pending ? "Envoi en cours…" : "Envoyer le compte-rendu ✉"}
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={copyToClipboard}
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
          title="Copier le texte du compte-rendu"
        >
          Copier
        </button>
      </div>
      {state?.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Écoute du flux d'événements d'une réunion.
 *
 * Deux corrections issues de la revue adverse du 18/08/2026.
 *
 * **Resynchronisation à l'ouverture.** Le navigateur reconnecte seul un
 * `EventSource` coupé, mais l'événement survenu pendant la coupure est perdu : sans
 * rafraîchissement à la reconnexion, l'écran restait en retard jusqu'au prochain
 * événement. C'est le cas normal pendant un déploiement bleu/vert, où le flux
 * bascule d'une instance à l'autre — et le cas où deux personnes en réunion
 * regardent des états différents sans le savoir, ce qui est plus dommageable qu'une
 * erreur affichée.
 *
 * **État visible.** L'utilisateur ne voyait ni la coupure ni la reconnexion : le
 * facilitateur croyait son écran synchronisé alors qu'il ne l'était plus.
 */
export default function SSEListener({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [connecte, setConnecte] = useState(true);

  useEffect(() => {
    const es = new EventSource(`/api/events/${meetingId}`);

    es.onopen = () => {
      setConnecte(true);
      // Rattrape ce qui a pu se produire pendant la coupure.
      router.refresh();
    };

    es.onmessage = () => {
      router.refresh();
    };

    es.onerror = () => {
      // Le navigateur reconnecte de lui-même ; on le dit, sans rien relancer.
      setConnecte(false);
    };

    return () => es.close();
  }, [meetingId, router]);

  if (connecte) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-yellow-950/90 border border-yellow-800 px-4 py-1.5 text-xs text-yellow-300 shadow-lg"
    >
      Temps réel interrompu — reconnexion…
    </div>
  );
}

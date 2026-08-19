import { type NextRequest } from "next/server";
import { acquireStreamSlot, dispose, subscribe } from "@/lib/sse";
import { resolveParticipant } from "@/lib/guest";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  // La route était ouverte à l'anonyme et sur n'importe quel id : chaque
  // connexion créait une entrée permanente dans le broker et un timer de ping.
  // `resolveParticipant` couvre les deux identités légitimes (membre de l'org,
  // invité porteur de jeton) et vérifie au passage l'existence de la réunion.
  const participant = await resolveParticipant(meetingId);
  if (!participant) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!acquireStreamSlot(participant.userId)) {
    return new Response("Too many streams", { status: 429 });
  }

  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let pingInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      subscribe(meetingId, ctrl, participant.userId);

      // Un seul chemin de sortie, pour que le créneau soit rendu quoi qu'il arrive.
      // L'échec d'un ping ne faisait qu'arrêter la minuterie : le client restait
      // inscrit et son créneau réservé, jusqu'au redémarrage du processus.
      const fermer = () => {
        clearInterval(pingInterval);
        dispose(meetingId, ctrl);
        try { ctrl.close(); } catch { /* déjà fermé */ }
      };

      // Keep-alive ping every 20s to prevent proxy/browser timeout
      pingInterval = setInterval(() => {
        try {
          ctrl.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          fermer();
        }
      }, 20_000);

      req.signal.addEventListener("abort", fermer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    },
  });
}

// In-process SSE broker — works on a single Node.js process (PM2 single instance).
// Survives hot-reload in dev via the global object.

const g = global as typeof global & {
  _sseClients?: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>;
  _sseCountByUser?: Map<string, number>;
};

if (!g._sseClients) {
  g._sseClients = new Map();
}
if (!g._sseCountByUser) {
  g._sseCountByUser = new Map();
}

export const sseClients = g._sseClients;

/**
 * Un flux SSE immobilise une connexion et un timer pour toute sa durée. La route
 * est authentifiée, mais un compte légitime peut encore en ouvrir autant qu'il
 * veut : ce plafond borne le coût par utilisateur sur un processus unique.
 */
const MAX_STREAMS_PER_USER = 8;
const streamCount = g._sseCountByUser;

/** Réserve un flux pour cet utilisateur, ou refuse si le plafond est atteint. */
export function acquireStreamSlot(userId: string): boolean {
  const current = streamCount.get(userId) ?? 0;
  if (current >= MAX_STREAMS_PER_USER) return false;
  streamCount.set(userId, current + 1);
  return true;
}

export function releaseStreamSlot(userId: string) {
  const current = streamCount.get(userId) ?? 0;
  if (current <= 1) streamCount.delete(userId);
  else streamCount.set(userId, current - 1);
}

const encoder = new TextEncoder();

export function subscribe(
  meetingId: string,
  ctrl: ReadableStreamDefaultController<Uint8Array>
) {
  if (!sseClients.has(meetingId)) sseClients.set(meetingId, new Set());
  sseClients.get(meetingId)!.add(ctrl);
}

export function unsubscribe(
  meetingId: string,
  ctrl: ReadableStreamDefaultController<Uint8Array>
) {
  const clients = sseClients.get(meetingId);
  if (!clients) return;
  clients.delete(ctrl);
  // La clé restait dans la Map après le départ du dernier client : la mémoire
  // du processus croissait d'une entrée par réunion vue, sans jamais retomber.
  if (clients.size === 0) sseClients.delete(meetingId);
}

export function broadcast(meetingId: string) {
  const clients = sseClients.get(meetingId);
  if (!clients || clients.size === 0) return;
  const msg = encoder.encode("data: update\n\n");
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(msg);
    } catch {
      clients.delete(ctrl);
    }
  }
  if (clients.size === 0) sseClients.delete(meetingId);
}

// In-process SSE broker — works on a single Node.js process (PM2 single instance).
// Survives hot-reload in dev via the global object.

const g = global as typeof global & {
  _sseClients?: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>;
};

if (!g._sseClients) {
  g._sseClients = new Map();
}

export const sseClients = g._sseClients;

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
  sseClients.get(meetingId)?.delete(ctrl);
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
}

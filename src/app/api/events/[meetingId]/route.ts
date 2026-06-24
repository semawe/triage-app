import { type NextRequest } from "next/server";
import { subscribe, unsubscribe } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let pingInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      subscribe(meetingId, ctrl);

      // Keep-alive ping every 20s to prevent proxy/browser timeout
      pingInterval = setInterval(() => {
        try {
          ctrl.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 20_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        unsubscribe(meetingId, ctrl);
        try { ctrl.close(); } catch { /* already closed */ }
      });
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

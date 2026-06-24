"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SSEListener({ meetingId }: { meetingId: string }) {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource(`/api/events/${meetingId}`);

    es.onmessage = () => {
      router.refresh();
    };

    es.onerror = () => {
      // Browser auto-reconnects on error — no manual retry needed
    };

    return () => es.close();
  }, [meetingId, router]);

  return null;
}

"use client";

import { useEffect, useState } from "react";

export default function ItemChrono({ activatedAt }: { activatedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(activatedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activatedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const isLong = elapsed > 300; // > 5 min

  return (
    <span
      className={`text-xs font-mono tabular-nums ${
        isLong ? "text-orange-400" : "text-gray-500"
      }`}
    >
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

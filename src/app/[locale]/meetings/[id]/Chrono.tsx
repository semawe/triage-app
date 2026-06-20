"use client";

import { useEffect, useState } from "react";

type Props = {
  openedAt: string; // ISO string (serialized from Date)
  durationMinutes?: number | null;
};

export default function Chrono({ openedAt, durationMinutes }: Props) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [openedAt]);

  const fmt = (s: number) => {
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.abs(s) % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (durationMinutes) {
    const total = durationMinutes * 60;
    const remaining = total - elapsed;
    const isOver = remaining < 0;
    const isWarning = remaining >= 0 && remaining < 5 * 60;

    return (
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            isOver
              ? "text-red-400 animate-pulse"
              : isWarning
              ? "text-orange-400"
              : "text-gray-300"
          }`}
        >
          {isOver ? `+${fmt(remaining)}` : fmt(remaining)}
        </span>
        <span className="text-xs text-gray-600">
          {isOver ? "dépassé" : "restantes"}
        </span>
      </div>
    );
  }

  return (
    <span className="font-mono text-sm text-gray-500 tabular-nums">{fmt(elapsed)}</span>
  );
}

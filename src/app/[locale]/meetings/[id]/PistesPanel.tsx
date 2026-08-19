"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

const PISTES = [
  { key: "action", trackKey: "next_action", color: "text-blue-300", dot: "bg-blue-500" },
  { key: "project", trackKey: "project", color: "text-orange-300", dot: "bg-orange-500" },
  { key: "waiting", trackKey: "waiting_for", color: "text-yellow-300", dot: "bg-yellow-500" },
  { key: "someday", trackKey: "someday_maybe", color: "text-purple-300", dot: "bg-purple-500" },
  { key: "reference", trackKey: "reference", color: "text-gray-300", dot: "bg-gray-500" },
  { key: "trash", trackKey: "trash", color: "text-red-300", dot: "bg-red-600" },
] as const;

const TACTIQUES_HOLACRACY = [
  "info", "resource", "share", "coordinate", "delegate",
] as const;

type Tab = "pistes" | "tactiques";

export default function PistesPanel() {
  const tT = useTranslations("triage");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("pistes");

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300 hover:border-gray-700 hover:text-white transition-colors whitespace-nowrap"
        title={tT("panel")}
      >
        <span className="text-xs">{open ? "▶" : "◀"}</span>
        <span className="font-medium">{tT("short")}</span>
      </button>

      {open && (
        <div className="mt-2 w-64 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setTab("pistes")}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tab === "pistes"
                  ? "text-white border-b-2 border-indigo-500 -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tT("gtd")}
            </button>
            <button
              onClick={() => setTab("tactiques")}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tab === "tactiques"
                  ? "text-white border-b-2 border-indigo-500 -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tT("tactical")}
            </button>
          </div>

          {tab === "pistes" && (
            <div className="p-4 space-y-4">
              {PISTES.map((p) => (
                <div key={p.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${p.dot}`} />
                    <p className={`text-sm font-semibold ${p.color}`}>{tT(`tracks.${p.trackKey}`)}</p>
                  </div>
                  <p className="pl-4 text-xs text-gray-400 italic">{tT(`guidance.${p.key}.question`)}</p>
                  <p className="pl-4 text-xs text-gray-500">{tT(`guidance.${p.key}.detail`)}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "tactiques" && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                {tT("tacticalHelp")}
              </p>
              {TACTIQUES_HOLACRACY.map((mode) => (
                <div key={mode} className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-200">{tT(`modes.${mode}.label`)}</p>
                  <p className="text-xs text-gray-500">{tT(`modes.${mode}.description`)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

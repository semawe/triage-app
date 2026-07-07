"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { searchOrg, type SearchResults } from "@/actions/search";

type FlatItem = {
  key: string;
  group: "circles" | "roles" | "members" | "meetings";
  label: string;
  sublabel: string;
  href: string | null;
};

const EMPTY: SearchResults = { circles: [], roles: [], members: [], meetings: [] };

const GROUP_DOTS: Record<FlatItem["group"], string> = {
  circles: "#6366f1",
  roles: "#f59e0b",
  members: "#10b981",
  meetings: "#0ea5e9",
};

export default function CommandPalette() {
  const t = useTranslations("search");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [activeIndex, setActiveIndex] = useState(0);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    setResults(EMPTY);
    setActiveIndex(0);
    setOpen(true);
    // Laisse le temps au dialog de se monter avant de focus
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  // Ouverture : Cmd+K / Ctrl+K, ou l'événement custom émis par la NavBar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("triapp:open-search", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("triapp:open-search", openPalette);
    };
  }, [open, openPalette]);

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const r = q.trim().length >= 2 ? await searchOrg(q) : EMPTY;
        setResults(r);
        setActiveIndex(0);
      });
    }, 220);
  }, []);

  const items: FlatItem[] = [
    ...results.circles.map((c) => ({
      key: `c-${c.id}`,
      group: "circles" as const,
      label: c.name,
      sublabel: c.type === "circle" ? "Cercle" : c.type === "instance" ? "Instance" : "Projet",
      href: `/circles/${c.id}`,
    })),
    ...results.roles.map((r) => ({
      key: `r-${r.id}`,
      group: "roles" as const,
      label: r.name,
      sublabel: `${r.spaceName}${r.holder ? ` · ${r.holder}` : ""}`,
      href: `/circles/${r.spaceId}?role=${r.id}`,
    })),
    ...results.members.map((m) => ({
      key: `m-${m.id}`,
      group: "members" as const,
      label: m.name ?? m.email,
      sublabel: m.email,
      href: "/members",
    })),
    ...results.meetings.map((m) => ({
      key: `mt-${m.id}`,
      group: "meetings" as const,
      label: m.title ?? `Triage · ${new Date(m.date).toLocaleDateString()}`,
      sublabel: m.spaceName,
      href: `/meetings/${m.id}`,
    })),
  ];

  function openItem(item: FlatItem) {
    if (!item.href) return;
    setOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault();
      openItem(items[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;

  let lastGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-gray-900 border border-gray-700 shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            runSearch(e.target.value);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={t("placeholder")}
          className="w-full bg-transparent px-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none border-b border-gray-800"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length >= 2 && items.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-600 text-center">{t("empty")}</p>
          )}
          {items.map((item, i) => {
            const showHeader = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {showHeader && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                    {t(`groups.${item.group}`)}
                  </p>
                )}
                <button
                  onClick={() => openItem(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    i === activeIndex ? "bg-gray-800" : ""
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: GROUP_DOTS[item.group] }}
                  />
                  <span className="text-sm text-gray-200 truncate">{item.label}</span>
                  <span className="text-xs text-gray-600 truncate ml-auto shrink-0 max-w-[45%]">
                    {item.sublabel}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <p className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-700">{t("hint")}</p>
      </div>
    </div>
  );
}

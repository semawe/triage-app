"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { switchOrg } from "@/actions/org";
import { useState, useTransition } from "react";
import type { FeatureKey } from "@/lib/features";

type Org = { id: string; name: string; logoUrl: string | null; primaryColor: string | null };
type LiveMeeting = { id: string; spaceName: string };

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const cls = `w-5 h-5 ${active ? "" : "opacity-60"}`;
  if (name === "home") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
    </svg>
  );
  if (name === "meetings") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
  if (name === "circles") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" />
    </svg>
  );
  if (name === "members") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
  if (name === "more") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
  return null;
}

export default function NavBar({
  showAdmin,
  activeOrg,
  allOrgs,
  liveMeetings,
  features,
  isOrgAdmin,
}: {
  showAdmin: boolean;
  activeOrg: Org;
  allOrgs: Org[];
  liveMeetings: LiveMeeting[];
  features: Record<FeatureKey, boolean>;
  isOrgAdmin: boolean;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("nav");
  const [switching, startSwitch] = useTransition();
  const [moreOpen, setMoreOpen] = useState(false);

  const brandColor = activeOrg.primaryColor ?? "#6366f1";

  // Chemin sans préfixe de locale, pour un état actif exact (borné) :
  // « /me » ne doit pas s'allumer sur /members ni /meetings.
  const path = pathname.replace(/^\/(fr|en)(?=\/|$)/, "") || "/";
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  const navItems = [
    { key: "home", label: t("home"), href: "/me", always: true },
    { key: "meetings", label: t("meetings"), href: "/meetings", always: true },
    { key: "circles", label: t("circles"), href: "/circles", always: true },
    { key: "members", label: t("members"), href: "/members", always: true },
    { key: "actions", label: t("actions"), href: "/actions", featureKey: "actions" as FeatureKey },
    { key: "projects", label: t("projects"), href: "/projects", featureKey: "projects" as FeatureKey },
    ...(isOrgAdmin ? [{ key: "settings", label: t("settings"), href: "/settings", always: true }] : []),
    ...(showAdmin ? [{ key: "admin", label: t("admin"), href: "/admin", always: true }] : []),
  ].filter((item) => {
    if (item.always) return true;
    if (item.featureKey) return features[item.featureKey];
    return true;
  });

  async function handleOrgChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const orgId = e.target.value;
    startSwitch(async () => {
      await switchOrg(orgId);
      // Hard navigation to ensure the new cookie is picked up by the RSC tree
      window.location.href = `/${locale}/me`;
    });
  }

  // Bottom nav mobile : 3 sections directes + « Plus » qui expose le reste.
  const bottomNavItems = [
    { key: "home", label: t("home"), href: "/me" },
    { key: "meetings", label: t("meetings"), href: "/meetings" },
    { key: "circles", label: t("circles"), href: "/circles" },
  ];
  const moreItems = navItems.filter((i) => !["home", "meetings", "circles"].includes(i.key));

  return (
    <>
      {/* ── Top bar ── */}
      <header
        className="border-b border-gray-800 bg-gray-900 px-4 py-3"
        style={{ borderBottomColor: `${brandColor}33` }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          {/* Left: Logo + org switcher */}
          <div className="flex items-center gap-3 min-w-0">
            {activeOrg.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeOrg.logoUrl} alt={activeOrg.name} className="h-7 w-7 rounded object-cover shrink-0" />
            ) : (
              <span
                className="h-7 w-7 rounded text-xs font-bold flex items-center justify-center shrink-0 text-white"
                style={{ background: brandColor }}
              >
                {activeOrg.name[0]?.toUpperCase()}
              </span>
            )}
            {allOrgs.length > 1 ? (
              <select
                value={activeOrg.id}
                onChange={handleOrgChange}
                disabled={switching}
                className="bg-transparent text-sm font-semibold text-white border-none outline-none cursor-pointer max-w-[140px] truncate"
              >
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id} className="bg-gray-900 text-white">{o.name}</option>
                ))}
              </select>
            ) : (
              <Link href="/me" className="text-sm font-semibold text-white truncate max-w-[140px]">
                {activeOrg.name}
              </Link>
            )}
          </div>

          {/* Center: Nav — desktop only */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active ? "font-medium" : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                  }`}
                  style={active ? { background: `${brandColor}33`, color: brandColor } : {}}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Search + live meeting + signout */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => window.dispatchEvent(new Event("triapp:open-search"))}
              className="flex items-center gap-1.5 rounded-lg border border-gray-800 px-2.5 py-1.5 text-xs text-gray-500 hover:border-gray-600 hover:text-gray-300 transition-colors"
              title={t("search")}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              <span className="hidden md:inline text-[10px] text-gray-600">⌘K</span>
            </button>
            {liveMeetings.length > 0 && (
              <Link
                href={`/meetings/${liveMeetings[0].id}`}
                className="flex items-center gap-1.5 rounded-full bg-green-900/50 border border-green-700 px-3 py-1 text-xs font-medium text-green-300 hover:bg-green-900 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="hidden sm:inline">{liveMeetings[0].spaceName}</span>
                <span className="sm:hidden">Live</span>
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              title={t("signOut")}
            >
              ↩
            </button>
          </div>
        </div>
      </header>

      {/* ── Feuille « Plus » — mobile ── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-16 inset-x-3 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl shadow-black/60 overflow-hidden"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {moreItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`block px-5 py-3 text-sm border-b border-gray-800/60 last:border-0 transition-colors ${
                  isActive(item.href) ? "text-white font-medium" : "text-gray-400"
                }`}
                style={isActive(item.href) ? { color: brandColor } : {}}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom nav — mobile only ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-800 bg-gray-900"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {bottomNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? "text-indigo-400" : "text-gray-500"
                }`}
                style={active ? { color: brandColor } : {}}
              >
                <NavIcon name={item.key} active={active} />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors ${
              moreOpen ? "text-gray-200" : "text-gray-500"
            }`}
          >
            <NavIcon name="more" active={moreOpen} />
            {t("more")}
          </button>
        </div>
      </nav>
    </>
  );
}

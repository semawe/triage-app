"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { switchOrg } from "@/actions/org";
import { useTransition } from "react";
import type { FeatureKey } from "@/lib/features";

type Org = { id: string; name: string; logoUrl: string | null; primaryColor: string | null };
type LiveMeeting = { id: string; spaceName: string };

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const cls = `w-5 h-5 ${active ? "" : "opacity-60"}`;
  if (name === "meetings") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
  if (name === "spaces") return (
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
  if (name === "settings") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
  const [switching, startSwitch] = useTransition();

  const brandColor = activeOrg.primaryColor ?? "#6366f1";

  const navItems = [
    { key: "meetings", label: "Réunions", href: "/meetings", always: true },
    { key: "circles", label: "Cercles", href: "/circles", always: true },
    { key: "members", label: "Membres", href: "/members", always: true },
    { key: "actions", label: "Actions", href: "/actions", featureKey: "actions" as FeatureKey },
    { key: "projects", label: "Projets", href: "/projects", featureKey: "projects" as FeatureKey },
    ...(isOrgAdmin ? [{ key: "settings", label: "Paramètres", href: "/settings", always: true }] : []),
    ...(showAdmin ? [{ key: "admin", label: "Admin", href: "/admin", always: true }] : []),
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
      window.location.href = `/${locale}/meetings`;
    });
  }

  // Bottom nav items (mobile — 4 max)
  const bottomNavItems = [
    { key: "meetings", label: "Réunions", href: "/meetings" },
    { key: "spaces", label: "Cercles", href: "/circles" },
    { key: "members", label: "Membres", href: "/members" },
    ...(isOrgAdmin ? [{ key: "settings", label: "Paramètres", href: "/settings" }] : []),
  ].slice(0, 4);

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
              <Link href="/meetings" className="text-sm font-semibold text-white truncate max-w-[140px]">
                {activeOrg.name}
              </Link>
            )}
          </div>

          {/* Center: Nav — desktop only */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            {navItems.map((item) => {
              const active = pathname.includes(item.href);
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

          {/* Right: Live meeting + signout */}
          <div className="flex items-center gap-3 shrink-0">
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
              title="Déconnexion"
            >
              ↩
            </button>
          </div>
        </div>
      </header>

      {/* ── Bottom nav — mobile only ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-800 bg-gray-900"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {bottomNavItems.map((item) => {
            const active = pathname.includes(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
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
        </div>
      </nav>
    </>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { switchOrg } from "@/actions/org";
import { useTransition } from "react";
import type { FeatureKey } from "@/lib/features";

type Org = { id: string; name: string; logoUrl: string | null; primaryColor: string | null };
type LiveMeeting = { id: string; spaceName: string };

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
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  const brandColor = activeOrg.primaryColor ?? "#6366f1";

  const navItems = [
    { key: "meetings", label: "Réunions", href: "/meetings", always: true },
    { key: "spaces", label: "Espaces", href: "/spaces", always: true },
    { key: "members", label: "Membres", href: "/members", always: true },
    { key: "circles", label: "Cercles", href: "/circles", featureKey: "circle_view" as FeatureKey },
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
      router.refresh();
    });
  }

  return (
    <header
      className="border-b border-gray-800 bg-gray-900 px-4 py-3"
      style={{ borderBottomColor: `${brandColor}33` }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        {/* Left: Logo + org switcher */}
        <div className="flex items-center gap-3 min-w-0">
          {activeOrg.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeOrg.logoUrl}
              alt={activeOrg.name}
              className="h-7 w-7 rounded object-cover shrink-0"
            />
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
                <option key={o.id} value={o.id} className="bg-gray-900 text-white">
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <Link href="/meetings" className="text-sm font-semibold text-white truncate max-w-[140px]">
              {activeOrg.name}
            </Link>
          )}
        </div>

        {/* Center: Nav */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center flex-wrap">
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
              {liveMeetings[0].spaceName}
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
  );
}

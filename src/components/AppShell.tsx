"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

const NAV_ITEMS = [
  { key: "meetings", label: "Réunions", href: "/meetings" },
  { key: "spaces", label: "Espaces", href: "/spaces" },
  { key: "members", label: "Membres", href: "/members" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/meetings" className="text-sm font-bold text-white tracking-tight">
            Triage App
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.includes(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-indigo-900/60 font-medium text-indigo-300"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

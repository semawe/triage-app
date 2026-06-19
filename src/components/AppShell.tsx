"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

const NAV_ITEMS = [
  { key: "meetings" as const, href: "/meetings", icon: "◎" },
  { key: "spaces" as const, href: "/spaces", icon: "⬡" },
  { key: "members" as const, href: "/members", icon: "◉" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/meetings" className="text-sm font-semibold text-gray-900">
            Triage App
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`/${locale}${item.href}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  pathname.includes(item.href)
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            {tAuth("signOut")}
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

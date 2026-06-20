import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createOrg } from "@/actions/org";

export default async function SetupPage() {
  const session = await auth();
  const locale = await getLocale().catch(() => "fr");

  if (!session?.user?.id) redirect(`/${locale}/login`);

  const existing = await prisma.organisationMember.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) redirect(`/${locale}/meetings`);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Créer votre organisation</h1>
          <p className="mt-2 text-sm text-gray-400">
            Bienvenue. Commencez par nommer votre organisation.
          </p>
        </div>

        <form action={createOrg} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
              Nom de l&apos;organisation
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              placeholder="Ex : Sémawé, Acme Corp…"
              className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Créer et continuer →
          </button>
        </form>
      </div>
    </main>
  );
}

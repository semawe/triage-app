import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { acceptInvite } from "@/actions/member";

type Props = { params: Promise<{ token: string; locale: string }> };

export default async function InvitePage({ params }: Props) {
  const { token, locale } = await params;
  const session = await auth();

  // Not logged in → go to login, come back after
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/${locale}/invite/${token}`);
    redirect(`/${locale}/login?callbackUrl=${callbackUrl}`);
  }

  const invite = await prisma.pendingInvite.findUnique({
    where: { token },
    include: { organisation: true },
  });

  if (!invite || invite.expiresAt < new Date()) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-2xl">⛔</p>
          <p className="text-white font-semibold">Lien d&apos;invitation invalide ou expiré</p>
          <p className="text-sm text-gray-500">Demande un nouveau lien à l&apos;administrateur.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-8 max-w-sm w-full text-center space-y-5">
        <p className="text-3xl">🎉</p>
        <h1 className="text-lg font-bold text-white">
          Rejoindre <span className="text-indigo-400">{invite.organisation.name}</span>
        </h1>
        <p className="text-sm text-gray-400">
          Tu es invité(e) en tant que{" "}
          <strong className="text-gray-200">
            {invite.role === "admin" ? "administrateur" : "membre"}
          </strong>
          .
        </p>
        <form action={acceptInvite.bind(null, token)}>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Rejoindre l&apos;organisation →
          </button>
        </form>
      </div>
    </main>
  );
}

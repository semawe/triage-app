import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/actions/member";

type Props = {
  params: Promise<{ token: string; locale: string }>;
  searchParams: Promise<{ full?: string; "wrong-account"?: string }>;
};

export default async function InvitePage({ params, searchParams }: Props) {
  const tI = await getTranslations("inviteLink");
  const { token, locale } = await params;
  const sp = await searchParams;
  const { full } = sp;
  const wrongAccount = sp["wrong-account"];
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
          <p className="text-white font-semibold">{tI("invalidTitle")}</p>
          <p className="text-sm text-gray-500">{tI("invalidBody")}</p>
        </div>
      </main>
    );
  }

  // Invitation nominative ouverte avec un autre compte que le destinataire.
  if (wrongAccount) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-6">
          <p className="text-2xl">✉️</p>
          <p className="text-white font-semibold">{tI("nominative")}</p>
          <p className="text-sm text-gray-500">
            {tI("wrongAccount", { email: session.user.email ?? "" })}
          </p>
        </div>
      </main>
    );
  }

  if (full) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-6">
          <p className="text-2xl">🚪</p>
          <p className="text-white font-semibold">
            {tI("fullTitle", { org: invite.organisation.name })}
          </p>
          <p className="text-sm text-gray-500">
            {tI("fullBody")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-8 max-w-sm w-full text-center space-y-5">
        <p className="text-3xl">🎉</p>
        <h1 className="text-lg font-bold text-white">
          {tI("join", { org: invite.organisation.name })}
        </h1>
        <p className="text-sm text-gray-400">
          {tI("invitedRole", { role: tI(invite.role === "admin" ? "adminRole" : "memberRole") })}
        </p>
        <form action={acceptInvite.bind(null, token)}>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            {tI("joinCta")}
          </button>
        </form>
      </div>
    </main>
  );
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requestJoin } from "@/actions/join";

type Props = { searchParams: Promise<{ orgId?: string }> };

export default async function JoinRequestPage({ searchParams }: Props) {
  const session = await auth();
  const locale = await getLocale().catch(() => "fr");

  if (!session?.user?.id) redirect(`/${locale}/login`);

  const { orgId } = await searchParams;
  if (!orgId) redirect(`/${locale}/setup`);

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, allowedEmailDomain: true },
  });

  if (!org || !org.allowedEmailDomain) redirect(`/${locale}/setup`);

  // Check domain match
  const email = session.user.email ?? "";
  const domain = email.split("@")[1] ?? "";
  if (domain !== org.allowedEmailDomain) redirect(`/${locale}/setup`);

  // Already a member?
  const existing = await prisma.organisationMember.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId: session.user.id } },
  });
  if (existing) redirect(`/${locale}/meetings`);

  // Already requested?
  const pending = await prisma.joinRequest.findUnique({
    where: { userId_organisationId: { userId: session.user.id, organisationId: orgId } },
  });

  async function submit() {
    "use server";
    await requestJoin(orgId!);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Rejoindre {org.name}</h1>
          <p className="mt-2 text-sm text-gray-400">
            Ton adresse <span className="text-indigo-300">{email}</span> est éligible pour rejoindre cette organisation.
          </p>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
          {pending ? (
            pending.status === "rejected" ? (
              <div className="text-center">
                <p className="text-sm text-red-400 mb-4">Ta demande a été refusée par l&apos;administrateur.</p>
                <form action={submit}>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                  >
                    Renvoyer une demande
                  </button>
                </form>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-3 text-yellow-400 text-2xl">⏳</div>
                <p className="text-sm text-gray-300 font-medium">Demande en attente</p>
                <p className="mt-1 text-xs text-gray-500">
                  L&apos;administrateur de {org.name} recevra une notification et pourra accepter ou refuser ta demande.
                </p>
              </div>
            )
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-6">
                Ta demande sera soumise à validation par l&apos;administrateur de l&apos;organisation. Tu seras notifié par email quand elle sera traitée.
              </p>
              <form action={submit}>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Demander à rejoindre {org.name}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">
          Tu n&apos;es pas dans la bonne organisation ?{" "}
          <a href={`/${locale}/setup`} className="text-indigo-400 hover:text-indigo-300">
            Créer la tienne
          </a>
        </p>
      </div>
    </div>
  );
}

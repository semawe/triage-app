import { prisma } from "@/lib/prisma";
import { getGuestByToken } from "@/lib/guest";
import { enterAsGuest } from "@/actions/guest";

type Props = { params: Promise<{ token: string }> };

export default async function GuestEntryPage({ params }: Props) {
  const { token } = await params;

  // Page publique par nécessité : son visiteur n'a par construction pas de
  // session. Le jeton EST son identité, et `getGuestByToken` en est la garde —
  // les conditions de validité ne sont pas réécrites ici (cf. src/lib/guest.ts).
  const guest = await getGuestByToken(token);
  const meeting = guest
    ? await prisma.meeting.findUnique({
        where: { id: guest.meetingId },
        include: { space: { select: { name: true } } },
      })
    : null;

  if (!guest || !meeting) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <p className="text-3xl">🔗</p>
          <h1 className="text-xl font-bold text-white">Lien invalide ou expiré</h1>
          <p className="text-sm text-gray-400">
            Ce lien d&apos;invitation n&apos;est plus valable. Demande à l&apos;hôte de la réunion
            de t&apos;en renvoyer un.
          </p>
        </div>
      </main>
    );
  }

  const title = meeting.title?.trim() || `Réunion — ${meeting.space.name}`;
  const enter = enterAsGuest.bind(null, token);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Rejoindre la réunion</h1>
          <p className="mt-2 text-sm text-gray-400">
            Tu es invité(e) à <span className="text-indigo-300">{title}</span> en tant
            qu&apos;invité ponctuel. Tu pourras suivre la réunion, ajouter des points et recevoir
            le compte-rendu.
          </p>
        </div>

        <form action={enter} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
              Ton nom
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              defaultValue={guest.name ?? ""}
              placeholder="Prénom Nom"
              className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Entrer dans la réunion →
          </button>
        </form>

        <p className="text-center text-xs text-gray-600">
          Invité comme <span className="text-gray-400">{guest.email}</span>
        </p>
      </div>
    </main>
  );
}

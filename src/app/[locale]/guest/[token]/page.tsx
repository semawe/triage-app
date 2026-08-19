import { prisma } from "@/lib/prisma";
import { getGuestByToken } from "@/lib/guest";
import { enterAsGuest } from "@/actions/guest";
import { getTranslations } from "next-intl/server";

type Props = { params: Promise<{ token: string }> };

export default async function GuestEntryPage({ params }: Props) {
  const { token } = await params;
  const t = await getTranslations("guest");

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
          <h1 className="text-xl font-bold text-white">{t("invalidTitle")}</h1>
          <p className="text-sm text-gray-400">
            {t("invalidBody")}
          </p>
        </div>
      </main>
    );
  }

  const title = meeting.title?.trim() || t("meetingOf", { space: meeting.space.name });
  const enter = enterAsGuest.bind(null, token);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">{t("joinTitle")}</h1>
          <p className="mt-2 text-sm text-gray-400">
            {t("joinIntro", { title })}
          </p>
        </div>

        <form action={enter} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
              {t("nameLabel")}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              defaultValue={guest.name ?? ""}
              placeholder={t("namePlaceholder")}
              className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            {t("enter")}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600">
          {t("invitedAs", { email: guest.email })}
        </p>
      </div>
    </main>
  );
}

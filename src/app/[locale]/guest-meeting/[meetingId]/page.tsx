import { prisma } from "@/lib/prisma";
import { getGuestForMeeting } from "@/lib/guest";
import { addAgendaItem } from "@/actions/meeting";
import SSEListener from "../../meetings/[id]/SSEListener";
import { getLocale, getTranslations } from "next-intl/server";

type Props = { params: Promise<{ meetingId: string }> };

const OUTPUT_TYPE_COLORS: Record<string, string> = {
  note: "bg-gray-700 text-gray-300",
  action: "bg-blue-900 text-blue-300",
  decision: "bg-purple-900 text-purple-300",
  project: "bg-orange-900 text-orange-300",
  governance: "bg-pink-900 text-pink-300",
};
export default async function GuestMeetingPage({ params }: Props) {
  const { meetingId } = await params;
  const t = await getTranslations("guest");
  const tOutput = await getTranslations("output.type");
  const locale = await getLocale();
  const outputTypeLabels: Record<string, string> = {
    note: tOutput("note"),
    action: tOutput("action"),
    decision: tOutput("decision"),
    project: tOutput("project"),
    governance: tOutput("governance"),
  };

  const guest = await getGuestForMeeting(meetingId);

  if (!guest) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <p className="text-3xl">🔒</p>
          <h1 className="text-xl font-bold text-white">{t("expiredTitle")}</h1>
          <p className="text-sm text-gray-400">
            {t("expiredBody")}
          </p>
        </div>
      </main>
    );
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      space: { select: { name: true } },
      agendaItems: {
        orderBy: { order: "asc" },
        include: {
          author: { select: { name: true } },
          outputs: {
            orderBy: { createdAt: "asc" },
            include: { assignee: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!meeting) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
        <p className="text-sm text-gray-400">{t("notFound")}</p>
      </main>
    );
  }

  const dateLabel = meeting.date.toLocaleDateString(locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const title = meeting.title?.trim() || dateLabel;
  const activeItem = meeting.agendaItems.find((i) => i.status === "active");
  const addItem = addAgendaItem.bind(null, meetingId);

  const statusLabel =
    meeting.status === "open" ? t("statusOpen") : meeting.status === "closed" ? t("statusClosed") : t("statusDraft");

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {meeting.status === "open" && <SSEListener meetingId={meeting.id} />}

      {/* Bandeau invité */}
      <div className="bg-indigo-950/60 border-b border-indigo-900 px-4 py-2 text-center text-xs text-indigo-200">
        {t("banner", { name: guest.user?.name ?? guest.email })}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* En-tête */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {meeting.space.name}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <span className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300">
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{dateLabel}</p>
        </div>

        {/* Ordre du jour */}
        <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t("agenda")}
            </p>
          </div>
          <div className="p-2 space-y-0.5">
            {meeting.agendaItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  item.status === "active"
                    ? "bg-indigo-950 border border-indigo-800 font-semibold text-white"
                    : item.status === "done"
                      ? "text-gray-600 line-through"
                      : "text-gray-300"
                }`}
              >
                <span className="flex-1 truncate">
                  {item.status === "active" ? "▶ " : ""}
                  {item.title}
                </span>
                <span className="text-xs text-gray-600 shrink-0">{item.author.name}</span>
              </div>
            ))}
            {meeting.agendaItems.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-600 text-center">{t("noItems")}</p>
            )}
          </div>
          {meeting.status !== "closed" && (
            <div className="p-3 border-t border-gray-800">
              <form action={addItem} className="flex gap-2">
                <input
                  name="title"
                  required
                  placeholder={t("proposePlaceholder")}
                  className="min-w-0 flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-600"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-indigo-900 hover:border-indigo-700 hover:text-white transition-colors"
                >
                  +
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Point actif + outputs (lecture seule) */}
        {meeting.status === "open" && activeItem && (
          <section className="space-y-3">
            <div className="rounded-xl bg-gray-900 border border-indigo-900 p-5">
              <h2 className="text-xl font-bold text-white leading-tight">{activeItem.title}</h2>
            </div>
            {activeItem.outputs.length > 0 && (
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
                {activeItem.outputs.map((o) => (
                  <div key={o.id} className="flex gap-3 items-start">
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${OUTPUT_TYPE_COLORS[o.type] ?? "bg-gray-700 text-gray-300"}`}
                    >
                      {outputTypeLabels[o.type] ?? o.type}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-200 leading-relaxed">{o.content}</p>
                      {o.assignee && (
                        <p className="text-xs text-gray-500 mt-0.5">→ {o.assignee.name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-600">
              {t("readOnlyOutputs")}
            </p>
          </section>
        )}

        {meeting.status === "closed" && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center">
            <p className="text-2xl">✓</p>
            <p className="mt-1 font-semibold text-white">{t("closed")}</p>
            <p className="mt-1 text-sm text-gray-500">
              {t("recapByEmail")}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

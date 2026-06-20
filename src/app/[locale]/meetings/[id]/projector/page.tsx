import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { jumpToItem, nextItem, closeMeeting } from "@/actions/meeting";

type Props = { params: Promise<{ id: string }> };

const OUTPUT_TYPE_COLORS: Record<string, string> = {
  note: "text-gray-400",
  action: "text-blue-300",
  decision: "text-purple-300",
  project: "text-orange-300",
  governance: "text-pink-300",
};
const OUTPUT_TYPE_LABELS: Record<string, string> = {
  note: "Note", action: "Action", decision: "Décision", project: "Projet", governance: "Gouvernance",
};

export default async function ProjectorPage({ params }: Props) {
  const { id } = await params;
  const { org } = await requireOrg();

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      space: true,
      agendaItems: {
        orderBy: { order: "asc" },
        include: {
          outputs: {
            orderBy: { createdAt: "asc" },
            include: { assignee: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!meeting || meeting.space.organisationId !== org.id) notFound();

  const activeItem = meeting.agendaItems.find((i) => i.status === "active");
  const pendingItems = meeting.agendaItems.filter((i) => i.status === "pending");
  const doneCount = meeting.agendaItems.filter((i) => i.status === "done").length;
  const total = meeting.agendaItems.length;

  const next = nextItem.bind(null, meeting.id, activeItem?.id ?? "");
  const close = closeMeeting.bind(null, meeting.id);

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* ── Left sidebar: agenda ── */}
      <aside className="w-56 shrink-0 border-r border-gray-800/60 bg-gray-900/40 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-800/60">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ordre du jour</p>
          <p className="text-xs text-gray-700 mt-0.5">{doneCount}/{total} traités</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {meeting.agendaItems.map((item) => {
            const jump = jumpToItem.bind(null, meeting.id, item.id);
            const isActive = item.status === "active";
            const isDone = item.status === "done";
            return (
              <form key={item.id} action={jump}>
                <button
                  type="submit"
                  disabled={isActive || meeting.status !== "open"}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm leading-snug transition-colors disabled:cursor-default ${
                    isActive
                      ? "bg-indigo-900/60 text-indigo-200 font-semibold"
                      : isDone
                      ? "text-gray-600 line-through"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`}
                >
                  <span className="mr-1.5 text-xs">{isActive ? "▶" : isDone ? "✓" : "·"}</span>
                  {item.title}
                </button>
              </form>
            );
          })}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="flex-1 flex flex-col p-8 md:p-12 min-w-0">
        {/* Top bar */}
        <div className="flex items-start justify-between mb-10 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">{org.name}</p>
            <p className="text-base font-semibold text-gray-300">{meeting.space.name}</p>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            {total > 0 && (
              <div className="text-right">
                <p className="text-2xl font-bold text-white tabular-nums">
                  {doneCount}<span className="text-gray-600">/{total}</span>
                </p>
                <p className="text-xs text-gray-500">traités</p>
              </div>
            )}
            <Link
              href={`/meetings/${id}`}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
            >
              ← Quitter
            </Link>
          </div>
        </div>

        {/* Active item */}
        {activeItem ? (
          <>
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-sm text-indigo-400 uppercase tracking-widest mb-4">Point en cours</p>
              <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-8">
                {activeItem.title}
              </h1>

              {activeItem.outputs.length > 0 && (
                <div className="space-y-3 max-w-3xl">
                  {activeItem.outputs.map((o) => (
                    <div key={o.id} className="flex items-start gap-4">
                      <span className={`text-sm font-semibold uppercase tracking-wider shrink-0 ${OUTPUT_TYPE_COLORS[o.type] ?? "text-gray-400"}`}>
                        {OUTPUT_TYPE_LABELS[o.type]}
                      </span>
                      <p className="text-xl text-gray-200">{o.content}</p>
                      {o.assignee && (
                        <span className="text-sm text-gray-500 shrink-0">→ {o.assignee.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom controls */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800/60">
              <p className="text-sm text-gray-600">
                {pendingItems.length > 0
                  ? `${pendingItems.length} point${pendingItems.length > 1 ? "s" : ""} restant${pendingItems.length > 1 ? "s" : ""}`
                  : "Dernier point"}
              </p>
              <form action={pendingItems.length > 0 ? next : close}>
                <button
                  type="submit"
                  className={`rounded-xl px-8 py-3 text-base font-semibold text-white transition-colors ${
                    pendingItems.length > 0 ? "bg-indigo-600 hover:bg-indigo-500" : "bg-emerald-700 hover:bg-emerald-600"
                  }`}
                >
                  {pendingItems.length > 0 ? "Point suivant →" : "Clore la réunion ✓"}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {meeting.status === "closed" ? (
                <>
                  <p className="text-6xl mb-4">✓</p>
                  <p className="text-2xl font-bold text-white">Réunion terminée</p>
                  <p className="text-gray-500 mt-2">{doneCount} points traités</p>
                </>
              ) : (
                <>
                  <p className="text-2xl text-gray-400">En attente d&apos;ouverture</p>
                  <p className="text-gray-600 mt-2 text-sm">{total} point{total !== 1 ? "s" : ""} à l&apos;ordre du jour</p>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

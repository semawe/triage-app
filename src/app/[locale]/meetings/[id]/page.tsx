import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PistesPanel from "./PistesPanel";
import {
  addAgendaItem,
  openMeeting,
  nextItem,
  closeMeeting,
} from "@/actions/meeting";
import { addOutput } from "@/actions/output";

type Props = { params: Promise<{ id: string }> };

export default async function MeetingPage({ params }: Props) {
  const { id } = await params;
  const { org } = await requireOrg();

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      space: { include: { organisation: true } },
      agendaItems: {
        orderBy: { order: "asc" },
        include: {
          author: { select: { name: true } },
          outputs: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!meeting) notFound();
  if (meeting.space.organisationId !== org.id) notFound();

  const activeItem = meeting.agendaItems.find((i) => i.status === "active");
  const pendingItems = meeting.agendaItems.filter((i) => i.status === "pending");
  const doneItems = meeting.agendaItems.filter((i) => i.status === "done");

  const addItem = addAgendaItem.bind(null, meeting.id);
  const open = openMeeting.bind(null, meeting.id);
  const next = nextItem.bind(null, meeting.id, activeItem?.id ?? "");
  const close = closeMeeting.bind(null, meeting.id);

  const dateLabel = meeting.date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            {meeting.space.name}
          </p>
          <h1 className="text-xl font-bold text-white capitalize">{dateLabel}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={meeting.status} />
          {meeting.status === "open" && (
            <form action={close}>
              <button
                type="submit"
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-red-800 hover:text-red-400 transition-colors"
              >
                Clore
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-4 items-start">
        {/* Left: Agenda */}
        <div className="w-60 shrink-0 flex flex-col rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Ordre du jour
            </p>
          </div>
          <div className="flex-1 p-2 space-y-0.5">
            {doneItems.map((item) => (
              <div
                key={item.id}
                className="px-3 py-2 rounded-lg text-sm text-gray-600 line-through"
              >
                {item.title}
              </div>
            ))}
            {activeItem && (
              <div className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-950 border border-indigo-800">
                ▶ {activeItem.title}
              </div>
            )}
            {pendingItems.map((item) => (
              <div key={item.id} className="px-3 py-2 rounded-lg text-sm text-gray-300">
                {item.title}
              </div>
            ))}
            {meeting.agendaItems.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-600 text-center">
                Aucun point
              </p>
            )}
          </div>

          {/* Add item */}
          {meeting.status !== "closed" && (
            <div className="p-3 border-t border-gray-800">
              <form action={addItem} className="flex gap-2">
                <input
                  name="title"
                  required
                  placeholder="Ajouter un point…"
                  className="min-w-0 flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-600"
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
        </div>

        {/* Center: Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* DRAFT state */}
          {meeting.status === "draft" && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 flex flex-col items-center justify-center gap-4 text-center">
              <p className="text-gray-400 text-sm">
                {meeting.agendaItems.length === 0
                  ? "Ajoutez des points à l'ordre du jour, puis ouvrez la réunion."
                  : `${meeting.agendaItems.length} point${meeting.agendaItems.length > 1 ? "s" : ""} à l'ordre du jour. Prêt ?`}
              </p>
              {meeting.agendaItems.length > 0 && (
                <form action={open}>
                  <button
                    type="submit"
                    className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                  >
                    Ouvrir la réunion →
                  </button>
                </form>
              )}
            </div>
          )}

          {/* OPEN + active item */}
          {meeting.status === "open" && activeItem && (
            <>
              {/* Active item card */}
              <div className="rounded-xl bg-gray-900 border border-indigo-900 p-6">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-2xl font-bold text-white leading-tight">
                    {activeItem.title}
                  </h2>
                  <span className="shrink-0 text-xs text-gray-500 mt-1">
                    {activeItem.author.name}
                  </span>
                </div>
              </div>

              {/* Outputs */}
              {activeItem.outputs.length > 0 && (
                <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
                  {activeItem.outputs.map((output) => (
                    <div key={output.id} className="flex gap-3 items-start">
                      <OutputTypeBadge type={output.type} />
                      <p className="text-sm text-gray-200 leading-relaxed">
                        {output.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add output form */}
              <form
                action={addOutput}
                className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3"
              >
                <input type="hidden" name="itemId" value={activeItem.id} />
                <select
                  name="type"
                  className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="note">Note</option>
                  <option value="action">Action</option>
                  <option value="decision">Décision</option>
                  <option value="project">Projet</option>
                  <option value="governance">Gouvernance</option>
                </select>
                <textarea
                  name="content"
                  required
                  rows={2}
                  placeholder="Saisir l'output…"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-indigo-700 hover:text-white transition-colors"
                >
                  Ajouter l&apos;output
                </button>
              </form>

              {/* Next / Close — separate form */}
              <div className="flex justify-end">
                <form action={pendingItems.length > 0 ? next : close}>
                  <button
                    type="submit"
                    className={`rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors ${
                      pendingItems.length > 0
                        ? "bg-indigo-600 hover:bg-indigo-500"
                        : "bg-emerald-700 hover:bg-emerald-600"
                    }`}
                  >
                    {pendingItems.length > 0 ? "Point suivant →" : "Clore la réunion ✓"}
                  </button>
                </form>
              </div>
            </>
          )}

          {/* OPEN + no active item (empty agenda after opening) */}
          {meeting.status === "open" && !activeItem && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 flex flex-col items-center justify-center gap-4">
              <p className="text-gray-400 text-sm">
                Tous les points ont été traités.
              </p>
              <form action={close}>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
                >
                  Clore la réunion ✓
                </button>
              </form>
            </div>
          )}

          {/* CLOSED */}
          {meeting.status === "closed" && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-3xl">✓</p>
              <p className="font-semibold text-white">Réunion terminée</p>
              <p className="text-sm text-gray-500">
                {meeting.agendaItems.length} point
                {meeting.agendaItems.length !== 1 ? "s" : ""} traité
                {meeting.agendaItems.length !== 1 ? "s" : ""}
              </p>

              {/* Outputs summary */}
              {meeting.agendaItems.flatMap((i) => i.outputs).length > 0 && (
                <div className="mt-6 w-full text-left space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Récapitulatif des outputs
                  </p>
                  {meeting.agendaItems
                    .filter((i) => i.outputs.length > 0)
                    .map((item) => (
                      <div key={item.id} className="space-y-2">
                        <p className="text-sm font-medium text-gray-300">{item.title}</p>
                        {item.outputs.map((o) => (
                          <div key={o.id} className="flex gap-3 items-start pl-4">
                            <OutputTypeBadge type={o.type} />
                            <p className="text-sm text-gray-400">{o.content}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Pistes panel */}
        <div className="shrink-0">
          <PistesPanel />
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    draft: { label: "Brouillon", classes: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
    open: { label: "En cours", classes: "bg-green-900/40 text-green-400 border-green-800" },
    closed: { label: "Terminée", classes: "bg-gray-800 text-gray-400 border-gray-700" },
  };
  const c = config[status] ?? config.closed;
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}

const OUTPUT_TYPE_COLORS: Record<string, string> = {
  note: "bg-gray-700 text-gray-300",
  action: "bg-blue-900 text-blue-300",
  decision: "bg-purple-900 text-purple-300",
  project: "bg-orange-900 text-orange-300",
  governance: "bg-pink-900 text-pink-300",
};

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  note: "Note",
  action: "Action",
  decision: "Décision",
  project: "Projet",
  governance: "Gouvernance",
};

function OutputTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
        OUTPUT_TYPE_COLORS[type] ?? "bg-gray-700 text-gray-300"
      }`}
    >
      {OUTPUT_TYPE_LABELS[type] ?? type}
    </span>
  );
}

import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { hasFeature } from "@/lib/features";
import PistesPanel from "./PistesPanel";
import Chrono from "./Chrono";
import ItemChrono from "./ItemChrono";
import EditableTitle from "./EditableTitle";
import {
  addAgendaItem,
  openMeeting,
  nextItem,
  closeMeeting,
  jumpToItem,
  updateMeetingLink,
  updateMeetingPrivacy,
  passScribe,
} from "@/actions/meeting";
import { addOutput, updateOutput, deleteOutput } from "@/actions/output";
import { OutputEntry, UnsavedOutputProvider, GuardedNavForm } from "./OutputEntry";
import OutputList from "./OutputList";
import GuestInvitePanel from "./GuestInvitePanel";
import SendRecapButton from "./SendRecapButton";
import SSEListener from "./SSEListener";
import { Link } from "@/i18n/navigation";
import { updateSpacePrivacy } from "@/actions/space";
import { getLocale } from "next-intl/server";

type Props = { params: Promise<{ id: string }> };

export default async function MeetingPage({ params }: Props) {
  const { id } = await params;
  const { org, session, membership } = await requireOrg();
  const isAdmin = membership.role === "admin";
  const f = {
    confidentiality: hasFeature(org, "confidentiality"),
    pistesPanel: hasFeature(org, "pistes_panel"),
    recapEmail: hasFeature(org, "recap_email"),
    projectorMode: hasFeature(org, "projector_mode"),
    actions: hasFeature(org, "actions"),
    governance: hasFeature(org, "governance"),
    projects: hasFeature(org, "projects"),
  };

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      space: { include: { organisation: true, members: { select: { userId: true } } } },
      agendaItems: {
        orderBy: { order: "asc" },
        include: {
          author: { select: { name: true, image: true } },
          outputs: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { name: true } }, assignee: { select: { name: true } } },
          },
        },
      },
      guests: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!meeting) notFound();
  if (meeting.space.organisationId !== org.id) notFound();

  // Privacy check (only when confidentiality feature is on)
  const isSpaceMember = meeting.space.members.some((m) => m.userId === session.user.id);
  const effectivePrivate = f.confidentiality && (meeting.isPrivate ?? meeting.space.isPrivate);
  if (effectivePrivate && !isAdmin && !isSpaceMember) {
    return (
      <AppShell>
        <div className="mt-24 text-center space-y-3">
          <p className="text-3xl">🔒</p>
          <p className="text-white font-semibold">Réunion confidentielle</p>
          <p className="text-sm text-gray-500">Réservée aux membres de l&apos;espace {meeting.space.name}.</p>
        </div>
      </AppShell>
    );
  }

  const activeItem = meeting.agendaItems.find((i) => i.status === "active");
  const pendingItems = meeting.agendaItems.filter((i) => i.status === "pending");
  const doneItems = meeting.agendaItems.filter((i) => i.status === "done");

  // Numérotation stable des points, dans l'ordre de l'ordre du jour (retour #32) :
  // permet de compter les points et de les citer par leur numéro.
  const itemNumbers = new Map(meeting.agendaItems.map((it, i) => [it.id, i + 1] as const));

  const addItem = addAgendaItem.bind(null, meeting.id);
  const open = openMeeting.bind(null, meeting.id);
  const next = nextItem.bind(null, meeting.id, activeItem?.id ?? "");
  const close = closeMeeting.bind(null, meeting.id);
  const updateLink = updateMeetingLink.bind(null, meeting.id);
  const setPrivateTrue = updateMeetingPrivacy.bind(null, meeting.id, true);
  const setPrivateFalse = updateMeetingPrivacy.bind(null, meeting.id, false);
  const setPrivateNull = updateMeetingPrivacy.bind(null, meeting.id, null);
  const setSpacePrivateTrue = updateSpacePrivacy.bind(null, meeting.spaceId, true);
  const setSpacePrivateFalse = updateSpacePrivacy.bind(null, meeting.spaceId, false);

  const dateLabel = meeting.date.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeLabel = meeting.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const hasTime = meeting.date.getHours() !== 0 || meeting.date.getMinutes() !== 0;
  const fallbackTitle = `${dateLabel}${hasTime ? ` · ${timeLabel}` : ""}`;

  // All org members for output assignee select
  const orgMembers = await prisma.organisationMember.findMany({
    where: { organisationId: org.id },
    include: { user: { select: { id: true, name: true } } },
  });
  const memberOptions = orgMembers.map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.id }));

  // Scribe (retour #32) : seul le scribe saisit/édite les outputs. scribeId null
  // (réunion héritée) = pas de restriction, tout le monde peut écrire.
  const scribeId = meeting.scribeId;
  const isActualScribe = !!scribeId && scribeId === session.user.id;
  const isScribe = !scribeId || isActualScribe;
  const scribeName = orgMembers.find((m) => m.userId === scribeId)?.user.name ?? null;
  const canManageScribe = isActualScribe || isAdmin;
  const pass = passScribe.bind(null, meeting.id);

  // Invités ponctuels (#31) : gérables par l'hôte de la réunion ou un admin de l'org.
  const isHost = meeting.createdById === session.user.id;
  const canManageGuests = isHost || isAdmin;
  const locale = await getLocale().catch(() => "fr");
  const guestBaseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const guestList = meeting.guests.map((g) => ({
    id: g.id,
    email: g.email,
    name: g.name,
    entered: !!g.userId,
    link: `${guestBaseUrl}/${locale}/guest/${g.token}`,
  }));

  return (
    <AppShell>
      {meeting.status === "open" && <SSEListener meetingId={meeting.id} />}
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/spaces/${meeting.spaceId}`} className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider">
              {meeting.space.name}
            </Link>
            {effectivePrivate && (
              <span className="text-xs text-gray-600" title="Confidentiel">🔒</span>
            )}
          </div>
          <EditableTitle
            meetingId={meeting.id}
            title={meeting.title}
            fallback={fallbackTitle}
          />
          {/* Link row */}
          <div className="mt-1 flex items-center gap-2">
            {meeting.link ? (
              <>
                <a
                  href={meeting.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors max-w-[300px] truncate"
                >
                  🔗 {meeting.link}
                </a>
                {isAdmin && (
                  <form action={updateLink}>
                    <input type="hidden" name="link" value="" />
                    <button type="submit" className="text-xs text-gray-600 hover:text-red-400 transition-colors">✕</button>
                  </form>
                )}
              </>
            ) : isAdmin ? (
              <form action={updateLink} className="flex gap-1 items-center">
                <input
                  name="link"
                  placeholder="Ajouter un lien (Fireflies, visio…)"
                  className="text-xs bg-transparent border-b border-gray-700 text-gray-500 placeholder-gray-700 focus:outline-none focus:border-indigo-600 w-56"
                />
                <button type="submit" className="text-xs text-gray-600 hover:text-indigo-400">↵</button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {meeting.status === "open" && meeting.openedAt && (
            <Chrono openedAt={meeting.openedAt.toISOString()} durationMinutes={meeting.durationMinutes} />
          )}
          <StatusBadge status={meeting.status} />
          {/* Projector mode */}
          {f.projectorMode && meeting.status === "open" && (
            <Link
              href={`/meetings/${meeting.id}/projector`}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
              title="Mode projecteur"
            >
              ⛶
            </Link>
          )}
          {meeting.status === "open" && (
            <form action={close}>
              <button type="submit" className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-red-800 hover:text-red-400 transition-colors">
                Clore
              </button>
            </form>
          )}
          {/* Privacy controls (admin only, confidentiality feature) */}
          {isAdmin && f.confidentiality && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span>Cette réunion :</span>
              <form action={setPrivateNull}>
                <button type="submit" className={`px-2 py-0.5 rounded ${meeting.isPrivate === null ? "bg-gray-700 text-gray-300" : "hover:text-gray-400"}`}
                  title={`Hérite du réglage de l'espace (${meeting.space.isPrivate ? "confidentiel" : "public"})`}>
                  Auto
                </button>
              </form>
              <form action={setPrivateFalse}>
                <button type="submit" className={`px-2 py-0.5 rounded ${meeting.isPrivate === false ? "bg-green-900 text-green-300" : "hover:text-gray-400"}`}>
                  Publique
                </button>
              </form>
              <form action={setPrivateTrue}>
                <button type="submit" className={`px-2 py-0.5 rounded ${meeting.isPrivate === true ? "bg-orange-900 text-orange-300" : "hover:text-gray-400"}`}>
                  Privée
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Space privacy — read-only indicator (toggle lives on the space page) */}
      {f.confidentiality && meeting.isPrivate === null && (
        <div className="mb-4 text-xs text-gray-700">
          Hérite de l&apos;espace : {meeting.space.isPrivate
            ? <span className="text-orange-500/70">confidentiel</span>
            : <span className="text-green-600/70">public</span>
          } — modifiable depuis{" "}
          <Link href={`/spaces/${meeting.spaceId}`} className="underline hover:text-gray-500">la page de l&apos;espace</Link>.
        </div>
      )}

      {/* Body */}
      <UnsavedOutputProvider>
      <div className="flex gap-4 items-start">
        {/* Left: Agenda */}
        <div className="w-60 shrink-0 flex flex-col rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ordre du jour</p>
          </div>
          <div className="flex-1 p-2 space-y-0.5">
            {doneItems.map((item) => {
              const jump = jumpToItem.bind(null, meeting.id, item.id);
              return (
                <GuardedNavForm key={item.id} action={jump}>
                  <button
                    type={meeting.status === "open" ? "submit" : "button"}
                    disabled={meeting.status !== "open"}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-600 line-through hover:bg-gray-800 hover:text-gray-400 transition-colors disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-gray-600"
                  >
                    <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-gray-600">{itemNumbers.get(item.id)}</span>
                    <AuthorAvatar name={item.author.name} image={item.author.image} size="xs" />
                    <span className="flex-1 truncate">{item.title}</span>
                  </button>
                </GuardedNavForm>
              );
            })}
            {activeItem && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-950 border border-indigo-800">
                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-indigo-300">{itemNumbers.get(activeItem.id)}</span>
                <AuthorAvatar name={activeItem.author.name} image={activeItem.author.image} size="xs" />
                <span className="flex-1 truncate text-sm font-semibold text-white">▶ {activeItem.title}</span>
                <ItemChrono activatedAt={activeItem.updatedAt.toISOString()} />
              </div>
            )}
            {pendingItems.map((item) => {
              const jump = jumpToItem.bind(null, meeting.id, item.id);
              return (
                <GuardedNavForm key={item.id} action={jump}>
                  <button
                    type={meeting.status === "open" ? "submit" : "button"}
                    disabled={meeting.status !== "open"}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-gray-300"
                  >
                    <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-gray-600">{itemNumbers.get(item.id)}</span>
                    <AuthorAvatar name={item.author.name} image={item.author.image} size="xs" />
                    <span className="flex-1 truncate">{item.title}</span>
                  </button>
                </GuardedNavForm>
              );
            })}
            {meeting.agendaItems.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-600 text-center">Aucun point</p>
            )}
          </div>
          {meeting.status !== "closed" && (
            <div className="p-3 border-t border-gray-800">
              <form action={addItem} className="flex gap-2">
                <input
                  name="title"
                  required
                  placeholder="Ajouter un point…"
                  className="min-w-0 flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-600"
                />
                <button type="submit" className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-indigo-900 hover:border-indigo-700 hover:text-white transition-colors">
                  +
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Center: Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* DRAFT */}
          {meeting.status === "draft" && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 flex flex-col items-center justify-center gap-4 text-center">
              <p className="text-gray-400 text-sm">
                {meeting.agendaItems.length === 0
                  ? "Ajoutez des points à l'ordre du jour, puis ouvrez la réunion."
                  : `${meeting.agendaItems.length} point${meeting.agendaItems.length > 1 ? "s" : ""} à l'ordre du jour. Prêt ?`}
              </p>
              {meeting.agendaItems.length > 0 && (
                <form action={open}>
                  <button type="submit" className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
                    Ouvrir la réunion →
                  </button>
                </form>
              )}
            </div>
          )}

          {/* OPEN + active item */}
          {meeting.status === "open" && activeItem && (
            <>
              <div className="rounded-xl bg-gray-900 border border-indigo-900 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-indigo-400/70 mb-1">Point n°{itemNumbers.get(activeItem.id)}</div>
                    <h2 className="text-2xl font-bold text-white leading-tight">{activeItem.title}</h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <AuthorAvatar name={activeItem.author.name} image={activeItem.author.image} size="sm" />
                    <span className="text-xs text-gray-500">{activeItem.author.name}</span>
                  </div>
                </div>
              </div>

              <OutputList
                key={`list-${activeItem.id}`}
                outputs={activeItem.outputs.map((o) => ({
                  id: o.id,
                  type: o.type,
                  content: o.content,
                  assigneeId: o.assigneeId,
                  assigneeName: o.assignee?.name ?? null,
                  dueDate: o.dueDate ? o.dueDate.toISOString().slice(0, 10) : null,
                }))}
                members={memberOptions}
                showActions={f.actions}
                showProjects={f.projects}
                showGovernance={f.governance}
                canEdit={isScribe}
                updateOutput={updateOutput}
                deleteOutput={deleteOutput}
              />

              {/* Scribe (retour #32) : qui tient le stylo + passage de relais */}
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="text-gray-500">
                  ✍️ Scribe : <span className="text-gray-300">{scribeName ?? "non défini"}</span>
                </span>
                {canManageScribe && memberOptions.length > 1 && (
                  <form action={pass} className="flex items-center gap-2">
                    <select
                      name="scribeId"
                      defaultValue=""
                      required
                      className="rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="" disabled>Passer le relais à…</option>
                      {memberOptions
                        .filter((m) => m.userId !== scribeId)
                        .map((m) => (
                          <option key={m.userId} value={m.userId}>{m.name}</option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-gray-700 px-2.5 py-1 text-gray-300 hover:border-indigo-600 hover:text-white transition-colors"
                    >
                      Passer
                    </button>
                  </form>
                )}
              </div>

              {isScribe ? (
                <OutputEntry
                  key={activeItem.id}
                  addOutput={addOutput}
                  itemId={activeItem.id}
                  showActions={f.actions}
                  showProjects={f.projects}
                  showGovernance={f.governance}
                  members={memberOptions}
                />
              ) : (
                <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 text-sm text-gray-500">
                  Seul le scribe{scribeName ? ` (${scribeName})` : ""} peut saisir les outputs de ce point.
                </div>
              )}

              <div className="flex justify-end">
                <GuardedNavForm action={pendingItems.length > 0 ? next : close}>
                  <button
                    type="submit"
                    className={`rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors ${pendingItems.length > 0 ? "bg-indigo-600 hover:bg-indigo-500" : "bg-emerald-700 hover:bg-emerald-600"}`}
                  >
                    {pendingItems.length > 0 ? "Point suivant →" : "Clore la réunion ✓"}
                  </button>
                </GuardedNavForm>
              </div>
            </>
          )}

          {/* OPEN + no active item */}
          {meeting.status === "open" && !activeItem && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 flex flex-col items-center justify-center gap-4">
              <p className="text-gray-400 text-sm">Tous les points ont été traités.</p>
              <form action={close}>
                <button type="submit" className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors">
                  Clore la réunion ✓
                </button>
              </form>
            </div>
          )}

          {/* CLOSED */}
          {meeting.status === "closed" && (() => {
            const recapText = [
              `Compte-rendu — ${meeting.space.name} — ${dateLabel}`,
              `${meeting.agendaItems.length} point${meeting.agendaItems.length !== 1 ? "s" : ""} traité${meeting.agendaItems.length !== 1 ? "s" : ""}`,
              "",
              ...meeting.agendaItems.filter((i) => i.outputs.length > 0).flatMap((item) => [
                `${itemNumbers.get(item.id)}. ${item.title}`,
                ...item.outputs.map((o) => `  [${OUTPUT_TYPE_LABELS[o.type] ?? o.type}] ${o.content}${o.assignee ? ` → ${o.assignee.name}` : ""}`),
                "",
              ]),
            ].join("\n");
            return (
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 space-y-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-3xl">✓</p>
                  <p className="font-semibold text-white">Réunion terminée</p>
                  <p className="text-sm text-gray-500">{meeting.agendaItems.length} point{meeting.agendaItems.length !== 1 ? "s" : ""} traité{meeting.agendaItems.length !== 1 ? "s" : ""}</p>
                  {f.recapEmail && (
                    <div className="mt-2">
                      <SendRecapButton meetingId={meeting.id} recapText={recapText} />
                    </div>
                  )}
                </div>
                {meeting.agendaItems.flatMap((i) => i.outputs).length > 0 && (
                  <div className="mt-2 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Récapitulatif des outputs</p>
                    {meeting.agendaItems.filter((i) => i.outputs.length > 0).map((item) => (
                      <div key={item.id} className="space-y-2">
                        <p className="text-sm font-medium text-gray-300">{itemNumbers.get(item.id)}. {item.title}</p>
                        {item.outputs.map((o) => (
                          <div key={o.id} className="flex gap-3 items-start pl-4">
                            <OutputTypeBadge type={o.type} />
                            <div>
                              <p className="text-sm text-gray-400">{o.content}</p>
                              {(o.assignee || o.dueDate) && (
                                <p className="text-xs text-gray-600">
                                  {o.assignee && `→ ${o.assignee.name}`}
                                  {o.dueDate && ` · ${new Date(o.dueDate).toLocaleDateString("fr-FR")}`}
                                  {o.isDone && " ✓"}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Right: Pistes */}
        {f.pistesPanel && (
          <div className="shrink-0">
            <PistesPanel />
          </div>
        )}
      </div>
      </UnsavedOutputProvider>

      {/* Invités ponctuels — hôte de la réunion ou admin, tant que la réunion n'est pas close */}
      {canManageGuests && meeting.status !== "closed" && (
        <div className="mt-4">
          <GuestInvitePanel meetingId={meeting.id} guests={guestList} />
        </div>
      )}
    </AppShell>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    draft: { label: "Brouillon", classes: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
    open: { label: "En cours", classes: "bg-green-900/40 text-green-400 border-green-800" },
    closed: { label: "Terminée", classes: "bg-gray-800 text-gray-400 border-gray-700" },
  };
  const c = config[status] ?? config.closed;
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${c.classes}`}>{c.label}</span>;
}

function AuthorAvatar({ name, image, size }: { name: string | null; image: string | null; size: "xs" | "sm" }) {
  const initials = name ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  const dim = size === "xs" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-xs";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={name ?? ""} className={`${dim} rounded-full shrink-0 object-cover`} />
    );
  }
  return (
    <span className={`${dim} rounded-full shrink-0 bg-indigo-800 text-indigo-200 font-semibold flex items-center justify-center`}>
      {initials}
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
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${OUTPUT_TYPE_COLORS[type] ?? "bg-gray-700 text-gray-300"}`}>
      {OUTPUT_TYPE_LABELS[type] ?? type}
    </span>
  );
}

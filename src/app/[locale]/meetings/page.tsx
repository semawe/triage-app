import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { createMeeting } from "@/actions/meeting";
import { Link } from "@/i18n/navigation";
import type { Meeting, Space } from "@/generated/prisma";

type MeetingWithSpace = Meeting & { space: Space };

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { org, session, membership } = await requireOrg();
  const { group } = await searchParams;
  const groupBySpace = group === "space";

  // Spaces where user is member
  const spaceMemberships = await prisma.spaceMember.findMany({
    where: { userId: session.user.id, space: { organisationId: org.id } },
    select: { spaceId: true },
  });
  const memberSpaceIds = new Set(spaceMemberships.map((s) => s.spaceId));
  const isAdmin = membership.role === "admin";

  const meetings = await prisma.meeting.findMany({
    where: { space: { organisationId: org.id } },
    include: { space: true },
    orderBy: { date: "desc" },
  });

  // Filter by privacy
  const visibleMeetings = meetings.filter((m) => {
    const effectivePrivate = m.isPrivate ?? m.space.isPrivate;
    if (!effectivePrivate) return true;
    return isAdmin || memberSpaceIds.has(m.spaceId);
  });

  const today = new Date().toISOString().split("T")[0];

  if (groupBySpace) {
    const bySpace = new Map<string, { space: Space; meetings: MeetingWithSpace[] }>();
    for (const m of visibleMeetings) {
      if (!bySpace.has(m.spaceId)) bySpace.set(m.spaceId, { space: m.space, meetings: [] });
      bySpace.get(m.spaceId)!.meetings.push(m);
    }

    return (
      <AppShell>
        <PageHeader org={org} groupBySpace={true} />
        <CreateForm org={org} today={today} />
        {[...bySpace.values()].map(({ space, meetings: sm }) => (
          <div key={space.id} className="mb-8">
            <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {space.name}
            </h2>
            <div className="space-y-2">
              {sm.map((m) => <MeetingRow key={m.id} meeting={m} />)}
            </div>
          </div>
        ))}
        {visibleMeetings.length === 0 && <Empty />}
      </AppShell>
    );
  }

  const open = visibleMeetings.filter((m) => m.status === "open");
  const draft = visibleMeetings.filter((m) => m.status === "draft");
  const closed = visibleMeetings.filter((m) => m.status === "closed");

  return (
    <AppShell>
      <PageHeader org={org} groupBySpace={false} />
      <CreateForm org={org} today={today} />
      {open.length > 0 && <MeetingGroup label="En cours" meetings={open} />}
      {draft.length > 0 && <MeetingGroup label="Brouillons" meetings={draft} />}
      {closed.length > 0 && <MeetingGroup label="Terminées" meetings={closed.slice(0, 20)} />}
      {visibleMeetings.length === 0 && <Empty />}
    </AppShell>
  );
}

function PageHeader({ org, groupBySpace }: { org: { name: string }; groupBySpace: boolean }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-white">Réunions</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">{org.name}</span>
        <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
          <Link
            href="/meetings"
            className={`px-3 py-1.5 ${!groupBySpace ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
          >
            Par statut
          </Link>
          <Link
            href="/meetings?group=space"
            className={`px-3 py-1.5 ${groupBySpace ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
          >
            Par espace
          </Link>
        </div>
      </div>
    </div>
  );
}

function CreateForm({ org, today }: { org: { spaces: { id: string; name: string }[] }; today: string }) {
  return (
    <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
      <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Nouvelle réunion
      </h2>
      <form action={createMeeting} className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Titre (optionnel)</label>
          <input
            type="text"
            name="title"
            placeholder="Triage hebdo…"
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Espace</label>
          <select
            name="spaceId"
            required
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {org.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date et heure</label>
          <input
            type="datetime-local"
            name="date"
            required
            defaultValue={`${today}T09:00`}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Durée</label>
          <select
            name="duration"
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">Sans limite</option>
            <option value="20">20 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">1 h</option>
            <option value="90">1 h 30</option>
            <option value="120">2 h</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Créer
        </button>
      </form>
    </div>
  );
}

function MeetingGroup({ label, meetings }: { label: string; meetings: MeetingWithSpace[] }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</h2>
      <div className="space-y-2">
        {meetings.map((m) => <MeetingRow key={m.id} meeting={m} />)}
      </div>
    </div>
  );
}

function MeetingRow({ meeting: m }: { meeting: MeetingWithSpace }) {
  const effectivePrivate = m.isPrivate ?? m.space.isPrivate;
  const dateLabel = m.date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const displayName = m.title ?? `Triage — ${dateLabel}`;

  return (
    <Link
      href={`/meetings/${m.id}`}
      className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-5 py-4 hover:border-gray-700 transition-colors group"
    >
      <div className="flex items-center gap-4 min-w-0">
        <StatusDot status={m.status} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors truncate">
            {displayName}
            {effectivePrivate && (
              <span className="ml-2 text-xs text-gray-600" title="Confidentiel">🔒</span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {m.space.name} · {m.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            {m.durationMinutes ? ` · ${m.durationMinutes} min` : ""}
          </p>
        </div>
      </div>
      <span className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0">→</span>
    </Link>
  );
}

function StatusDot({ status }: { status: string }) {
  const classes: Record<string, string> = {
    open: "bg-green-500 animate-pulse",
    draft: "bg-yellow-500",
    closed: "bg-gray-600",
  };
  return <span className={`h-2 w-2 rounded-full shrink-0 ${classes[status] ?? "bg-gray-600"}`} />;
}

function Empty() {
  return <p className="mt-16 text-center text-gray-500">Aucune réunion. Créez-en une ci-dessus.</p>;
}

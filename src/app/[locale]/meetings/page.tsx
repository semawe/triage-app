import { requireOrg } from "@/lib/session";
import { viewerFrom, visibleMeetingWhere } from "@/lib/visibility";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { createMeeting } from "@/actions/meeting";
import { Link } from "@/i18n/navigation";
import DecalageHoraire from "./DecalageHoraire";
import { getLocale, getTranslations } from "next-intl/server";
import type { Meeting, Space } from "@/generated/prisma";

type MeetingWithSpace = Meeting & { space: Space };

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const ctx = await requireOrg();
  const { org } = ctx;
  const { group } = await searchParams;
  const groupBySpace = group === "space";
  const t = await getTranslations("meeting");

  // Le cloisonnement passe par le prédicat partagé, et non par un filtre réécrit
  // ici : celui qui vivait à cet endroit ignorait le drapeau `confidentiality`,
  // donc cachait des réunions que les actions laissaient par ailleurs ouvertes.
  const visibleMeetings = await prisma.meeting.findMany({
    where: visibleMeetingWhere(viewerFrom(ctx)),
    include: { space: true },
    orderBy: { date: "desc" },
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
      {open.length > 0 && <MeetingGroup label={t("status.open")} meetings={open} />}
      {draft.length > 0 && <MeetingGroup label={t("status.draft")} meetings={draft} />}
      {closed.length > 0 && <MeetingGroup label={t("status.closed")} meetings={closed.slice(0, 20)} />}
      {visibleMeetings.length === 0 && <Empty />}
    </AppShell>
  );
}

async function PageHeader({ org, groupBySpace }: { org: { name: string }; groupBySpace: boolean }) {
  const t = await getTranslations("meeting");
  return (
    <div className="mb-8 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-white">{t("list")}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">{org.name}</span>
        <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
          <Link
            href="/meetings"
            className={`px-3 py-1.5 ${!groupBySpace ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t("byStatus")}
          </Link>
          <Link
            href="/meetings?group=space"
            className={`px-3 py-1.5 ${groupBySpace ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t("bySpace")}
          </Link>
        </div>
      </div>
    </div>
  );
}

async function CreateForm({ org, today }: { org: { spaces: { id: string; name: string }[] }; today: string }) {
  const t = await getTranslations("meeting");
  const tc = await getTranslations("common");
  return (
    <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
      <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {t("new")}
      </h2>
      <form action={createMeeting} className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t("titleOptional")}</label>
          <input
            type="text"
            name="title"
            placeholder={t("titlePlaceholder")}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t("space")}</label>
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
          <label htmlFor="meeting-date" className="text-xs text-gray-500">
            {t("dateTime")}
          </label>
          <DecalageHoraire />
          <input
            id="meeting-date"
            type="datetime-local"
            name="date"
            required
            defaultValue={`${today}T09:00`}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t("duration")}</label>
          <select
            name="duration"
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">{t("noLimit")}</option>
            <option value="20">{t("minutes", { n: 20 })}</option>
            <option value="30">{t("minutes", { n: 30 })}</option>
            <option value="45">{t("minutes", { n: 45 })}</option>
            <option value="60">1 h</option>
            <option value="90">1 h 30</option>
            <option value="120">2 h</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          {tc("create")}
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

async function MeetingRow({ meeting: m }: { meeting: MeetingWithSpace }) {
  const t = await getTranslations("meeting");
  const locale = await getLocale();
  const effectivePrivate = m.isPrivate ?? m.space.isPrivate;
  const dateLabel = m.date.toLocaleDateString(locale, {
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
              <span className="ml-2 text-xs text-gray-600" title={t("confidentialShort")}>🔒</span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {m.space.name} · {m.date.toLocaleDateString(locale, { day: "numeric", month: "long" })}
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

async function Empty() {
  const t = await getTranslations("meeting");
  return <p className="mt-16 text-center text-gray-500">{t("empty")}</p>;
}

import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { createMeeting } from "@/actions/meeting";
import { Link } from "@/i18n/navigation";
import type { Meeting, Space } from "@/generated/prisma";

type MeetingWithSpace = Meeting & { space: Space };

export default async function MeetingsPage() {
  const { org } = await requireOrg();

  const meetings = await prisma.meeting.findMany({
    where: { space: { organisationId: org.id } },
    include: { space: true },
    orderBy: { date: "desc" },
  });

  const open = meetings.filter((m) => m.status === "open");
  const draft = meetings.filter((m) => m.status === "draft");
  const closed = meetings.filter((m) => m.status === "closed");

  const today = new Date().toISOString().split("T")[0];

  return (
    <AppShell>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Réunions</h1>
        <span className="text-sm text-gray-400">{org.name}</span>
      </div>

      {/* Création */}
      <div className="mb-8 rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Nouvelle réunion
        </h2>
        <form action={createMeeting} className="flex flex-wrap gap-3">
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
          <input
            type="date"
            name="date"
            required
            defaultValue={today}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Créer
          </button>
        </form>
      </div>

      {/* Listes */}
      {open.length > 0 && <MeetingGroup label="En cours" meetings={open} />}
      {draft.length > 0 && <MeetingGroup label="Brouillons" meetings={draft} />}
      {closed.length > 0 && (
        <MeetingGroup label="Terminées" meetings={closed.slice(0, 20)} />
      )}

      {meetings.length === 0 && (
        <p className="mt-16 text-center text-gray-500">
          Aucune réunion. Créez-en une ci-dessus.
        </p>
      )}
    </AppShell>
  );
}

function MeetingGroup({
  label,
  meetings,
}: {
  label: string;
  meetings: MeetingWithSpace[];
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </h2>
      <div className="space-y-2">
        {meetings.map((m) => (
          <Link
            key={m.id}
            href={`/meetings/${m.id}`}
            className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-5 py-4 hover:border-gray-700 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <StatusDot status={m.status} />
              <div>
                <p className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors">
                  Triage —{" "}
                  {m.date.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <p className="text-xs text-gray-500">{m.space.name}</p>
              </div>
            </div>
            <span className="text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const classes: Record<string, string> = {
    open: "bg-green-500",
    draft: "bg-yellow-500",
    closed: "bg-gray-600",
  };
  return (
    <span
      className={`h-2 w-2 rounded-full shrink-0 ${classes[status] ?? "bg-gray-600"}`}
    />
  );
}

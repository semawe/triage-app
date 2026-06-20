import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { toggleOutputDone } from "@/actions/output";
import { hasFeature } from "@/lib/features";
import { Link } from "@/i18n/navigation";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; space?: string }>;
}) {
  const { org, session, membership } = await requireOrg();

  if (!hasFeature(org, "projects")) notFound();

  const { filter, space: spaceFilter } = await searchParams;
  const showDone = filter === "done";
  const showAll = filter === "all" && membership.role === "admin";

  const spaces = await prisma.space.findMany({
    where: { organisationId: org.id },
    orderBy: { name: "asc" },
  });

  const outputs = await prisma.output.findMany({
    where: {
      type: "project",
      ...(showAll ? {} : { assigneeId: session.user.id }),
      ...(showDone ? {} : { isDone: false }),
      ...(spaceFilter ? { item: { meeting: { spaceId: spaceFilter } } } : {}),
      item: { meeting: { space: { organisationId: org.id } } },
    },
    include: {
      assignee: { select: { name: true, image: true } },
      item: {
        include: {
          meeting: { include: { space: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: [{ isDone: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  const open = outputs.filter((o) => !o.isDone);
  const done = outputs.filter((o) => o.isDone);

  return (
    <AppShell>
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">Projets</h1>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter by space */}
          <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
            <Link
              href={buildUrl(showAll, showDone, undefined)}
              className={`px-3 py-1.5 ${!spaceFilter ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
            >
              Tous espaces
            </Link>
            {spaces.map((s) => (
              <Link
                key={s.id}
                href={buildUrl(showAll, showDone, s.id)}
                className={`px-3 py-1.5 ${spaceFilter === s.id ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
              >
                {s.name}
              </Link>
            ))}
          </div>

          {/* Mine / all / done */}
          {membership.role === "admin" && (
            <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
              <Link
                href={buildUrl(false, false, spaceFilter)}
                className={`px-3 py-1.5 ${!showAll && !showDone ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
              >
                Les miens
              </Link>
              <Link
                href={buildUrl(true, false, spaceFilter)}
                className={`px-3 py-1.5 ${showAll ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
              >
                Toute l&apos;org
              </Link>
              <Link
                href={buildUrl(false, true, spaceFilter)}
                className={`px-3 py-1.5 ${showDone ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
              >
                Terminés
              </Link>
            </div>
          )}
        </div>
      </div>

      {outputs.length === 0 && (
        <p className="mt-16 text-center text-gray-500">
          Aucun projet{showDone ? " terminé" : " en cours"}.
        </p>
      )}

      {open.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            En cours · {open.length}
          </h2>
          <div className="space-y-2">
            {open.map((o) => <ProjectRow key={o.id} output={o} />)}
          </div>
        </div>
      )}

      {(showDone || done.length > 0) && done.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Terminés · {done.length}
          </h2>
          <div className="space-y-2 opacity-60">
            {done.map((o) => <ProjectRow key={o.id} output={o} />)}
          </div>
        </div>
      )}

      {open.length > 0 && !showDone && done.length > 0 && (
        <p className="mt-4 text-center text-xs text-gray-600">
          {done.length} projet{done.length > 1 ? "s" : ""} terminé{done.length > 1 ? "s" : ""} ·{" "}
          <Link href={buildUrl(showAll, true, spaceFilter)} className="text-indigo-500 hover:text-indigo-300">
            Voir
          </Link>
        </p>
      )}
    </AppShell>
  );
}

function buildUrl(all: boolean, done: boolean, space: string | undefined): string {
  const params = new URLSearchParams();
  if (all) params.set("filter", "all");
  else if (done) params.set("filter", "done");
  if (space) params.set("space", space);
  const qs = params.toString();
  return `/projects${qs ? `?${qs}` : ""}`;
}

function ProjectRow({
  output: o,
}: {
  output: {
    id: string;
    content: string;
    isDone: boolean;
    dueDate: Date | null;
    assignee: { name: string | null; image: string | null } | null;
    item: {
      meeting: {
        id: string;
        date: Date;
        title: string | null;
        space: { id: string; name: string };
      };
    };
  };
}) {
  const toggle = toggleOutputDone.bind(null, o.id);
  const meetingDate = o.item.meeting.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const meetingLabel = o.item.meeting.title ?? `Triage · ${meetingDate}`;
  const isOverdue = o.dueDate && !o.isDone && new Date(o.dueDate) < new Date();

  return (
    <div className="flex items-start gap-4 rounded-xl bg-gray-900 border border-gray-800 px-5 py-4">
      <form action={toggle} className="mt-0.5">
        <button
          type="submit"
          className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
            o.isDone
              ? "bg-emerald-900 border-emerald-700 text-emerald-300"
              : "border-gray-600 hover:border-indigo-500"
          }`}
          title={o.isDone ? "Rouvrir" : "Marquer terminé"}
        >
          {o.isDone && <span className="text-xs">✓</span>}
        </button>
      </form>

      <div className="flex-1 min-w-0">
        <p className={`text-sm text-white leading-snug ${o.isDone ? "line-through text-gray-500" : ""}`}>
          {o.content}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <Link
            href={`/spaces/${o.item.meeting.space.id}`}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {o.item.meeting.space.name}
          </Link>
          <span className="text-gray-700">·</span>
          <Link
            href={`/meetings/${o.item.meeting.id}`}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {meetingLabel}
          </Link>
          {o.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-red-400" : "text-gray-500"}`}>
              {isOverdue && "⚠ "}Échéance : {new Date(o.dueDate).toLocaleDateString("fr-FR")}
            </span>
          )}
          {o.assignee && (
            <span className="text-xs text-gray-600">→ {o.assignee.name}</span>
          )}
        </div>
      </div>

      <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-orange-900 text-orange-300">
        Projet
      </span>
    </div>
  );
}

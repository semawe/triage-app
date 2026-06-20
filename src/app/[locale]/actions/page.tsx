import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { toggleOutputDone } from "@/actions/output";
import { Link } from "@/i18n/navigation";

const OUTPUT_TYPE_COLORS: Record<string, string> = {
  action: "bg-blue-900 text-blue-300",
};

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { org, session, membership } = await requireOrg();
  const { filter } = await searchParams;
  const showAll = filter === "all" && membership.role === "admin";

  const outputs = await prisma.output.findMany({
    where: {
      type: "action",
      ...(showAll ? {} : { assigneeId: session.user.id }),
      item: {
        meeting: { space: { organisationId: org.id } },
      },
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

  const todo = outputs.filter((o) => !o.isDone);
  const done = outputs.filter((o) => o.isDone);

  return (
    <AppShell>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Mes actions</h1>
        {membership.role === "admin" && (
          <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
            <Link
              href="/actions"
              className={`px-3 py-1.5 ${!showAll ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
            >
              Les miennes
            </Link>
            <Link
              href="/actions?filter=all"
              className={`px-3 py-1.5 ${showAll ? "bg-indigo-900/60 text-indigo-300 font-medium" : "text-gray-500 hover:text-gray-300"}`}
            >
              Toute l&apos;org
            </Link>
          </div>
        )}
      </div>

      {outputs.length === 0 && (
        <p className="mt-16 text-center text-gray-500">
          Aucune action{showAll ? " dans l'organisation" : " qui vous est assignée"}.
        </p>
      )}

      {todo.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            À faire · {todo.length}
          </h2>
          <div className="space-y-2">
            {todo.map((o) => <ActionRow key={o.id} output={o} />)}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Terminées · {done.length}
          </h2>
          <div className="space-y-2 opacity-60">
            {done.map((o) => <ActionRow key={o.id} output={o} />)}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ActionRow({
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
          title={o.isDone ? "Marquer non terminé" : "Marquer terminé"}
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
            href={`/meetings/${o.item.meeting.id}`}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {o.item.meeting.space.name} · {meetingLabel}
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

      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${OUTPUT_TYPE_COLORS.action}`}>
        Action
      </span>
    </div>
  );
}

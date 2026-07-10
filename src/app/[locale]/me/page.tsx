import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import { toggleOutputDone } from "@/actions/output";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

// Réunions pertinentes : en cours, ou brouillons pas plus vieux que 2 h.
// (Hors composant : la règle de pureté RSC interdit Date.now() pendant le rendu.)
function upcomingMeetingsWhere(orgId: string) {
  return {
    space: { organisationId: orgId },
    OR: [
      { status: "open" as const },
      { status: "draft" as const, date: { gte: new Date(Date.now() - 2 * 3600 * 1000) } },
    ],
  };
}

export default async function MePage() {
  const { session, org, membership } = await requireOrg();
  const t = await getTranslations("me");
  const userId = session.user.id;
  const isAdmin = membership.role === "admin";

  const [assignments, spaceMemberships, actions, meetingsRaw] = await Promise.all([
    prisma.roleAssignment.findMany({
      where: {
        userId,
        endDate: null,
        role: { space: { organisationId: org.id } },
      },
      include: { role: { include: { space: { select: { id: true, name: true } } } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.spaceMember.findMany({
      where: { userId, space: { organisationId: org.id } },
      include: {
        space: {
          select: { id: true, name: true, type: true, _count: { select: { roles: true, children: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.output.findMany({
      where: {
        type: "action",
        isDone: false,
        assigneeId: userId,
        item: { meeting: { space: { organisationId: org.id } } },
      },
      include: {
        item: { include: { meeting: { select: { id: true, title: true, date: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 8,
    }),
    prisma.meeting.findMany({
      where: upcomingMeetingsWhere(org.id),
      include: { space: { select: { id: true, name: true, isPrivate: true } } },
      orderBy: { date: "asc" },
      take: 12,
    }),
  ]);

  const mySpaceIds = new Set(spaceMemberships.map((m) => m.spaceId));
  const meetings = meetingsRaw
    .filter((m) => {
      const effectivePrivate = m.isPrivate ?? m.space.isPrivate;
      return !effectivePrivate || isAdmin || mySpaceIds.has(m.spaceId);
    })
    .slice(0, 5);

  const firstName = session.user.name?.split(" ")[0] ?? "";

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-white mb-8">{t("greeting", { name: firstName })}</h1>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* ── Mes rôles ── */}
        <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-amber-500/80 uppercase tracking-wider">
              {t("myRoles")} · {assignments.length}
            </h2>
          </div>
          {assignments.length > 0 ? (
            <div className="divide-y divide-gray-800/60">
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  href={`/circles/${a.role.space.id}?role=${a.role.id}`}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-800/50 transition-colors group"
                >
                  <span className="text-sm text-gray-200 group-hover:text-white truncate">
                    {a.role.name}
                  </span>
                  <span className="text-xs text-gray-600 shrink-0 ml-3">{a.role.space.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-600">{t("noRoles")}</p>
          )}
        </section>

        {/* ── Mes cercles ── */}
        <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-indigo-400/80 uppercase tracking-wider">
              {t("myCircles")} · {spaceMemberships.length}
            </h2>
          </div>
          {spaceMemberships.length > 0 ? (
            <div className="divide-y divide-gray-800/60">
              {spaceMemberships.map((sm) => (
                <Link
                  key={sm.id}
                  href={`/circles/${sm.space.id}`}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-800/50 transition-colors group"
                >
                  <span className="text-sm text-gray-200 group-hover:text-white truncate">
                    {sm.space.name}
                  </span>
                  <span className="text-xs shrink-0 ml-3">
                    {sm.role === "lead" ? (
                      <span className="text-indigo-400">Leader</span>
                    ) : (
                      <span className="text-gray-600">Membre</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-600">{t("noCircles")}</p>
          )}
        </section>

        {/* ── Mes actions ── */}
        <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-blue-400/80 uppercase tracking-wider">
              {t("myActions")}
            </h2>
            <Link href="/actions" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              {t("allActions")}
            </Link>
          </div>
          {actions.length > 0 ? (
            <div className="divide-y divide-gray-800/60">
              {actions.map((o) => {
                const isOverdue = o.dueDate && new Date(o.dueDate) < new Date();
                return (
                  <div key={o.id} className="flex items-start gap-3 px-5 py-2.5">
                    <form action={toggleOutputDone.bind(null, o.id)} className="mt-0.5">
                      <button
                        type="submit"
                        className="h-4 w-4 rounded border border-gray-600 hover:border-indigo-500 transition-colors"
                        title="Marquer terminé"
                      />
                    </form>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 leading-snug">{o.content}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        <Link href={`/meetings/${o.item.meeting.id}`} className="hover:text-gray-400 transition-colors">
                          {o.item.meeting.title ?? o.item.meeting.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </Link>
                        {o.dueDate && (
                          <span className={isOverdue ? "text-red-400" : ""}>
                            {" · "}{isOverdue ? "⚠ " : ""}{new Date(o.dueDate).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-600">{t("noActions")}</p>
          )}
        </section>

        {/* ── Réunions ── */}
        <section className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-green-400/80 uppercase tracking-wider">
              {t("upcomingMeetings")}
            </h2>
            <Link href="/meetings" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              {t("allMeetings")}
            </Link>
          </div>
          {meetings.length > 0 ? (
            <div className="divide-y divide-gray-800/60">
              {meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-800/50 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {m.status === "open" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                    )}
                    <span className="text-sm text-gray-200 group-hover:text-white truncate">
                      {m.title ?? `Triage · ${m.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
                    </span>
                  </div>
                  <span className="text-xs text-gray-600 shrink-0 ml-3">
                    {m.status === "open"
                      ? t("live")
                      : m.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    {" · "}{m.space.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-600">{t("noMeetings")}</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { hasFeature } from "@/lib/features";
import AppShell from "@/components/AppShell";
import CircleViz from "./CircleViz";

type Props = { searchParams: Promise<{ parent?: string }> };

export default async function CirclesPage({ searchParams }: Props) {
  const { parent: parentId } = await searchParams;
  const { org, session } = await requireOrg();

  if (!hasFeature(org, "circle_view")) notFound();

  const spaces = await prisma.space.findMany({
    where: {
      organisationId: org.id,
      parentId: parentId ?? null,
    },
    include: {
      members: {
        where: { role: "lead" },
        include: { user: { select: { id: true, name: true, image: true } } },
        take: 1,
      },
      _count: { select: { children: true, roles: true } },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const parentSpace = parentId
    ? await prisma.space.findFirst({
        where: { id: parentId, organisationId: org.id },
        select: {
          id: true, name: true,
          parent: { select: { id: true, name: true } },
        },
      })
    : null;

  // Rôles du cercle courant : dessinés dans la carte aux côtés des sous-espaces
  // (un cercle contient ses sous-cercles ET ses rôles).
  const roles = parentSpace
    ? await prisma.role.findMany({
        where: { spaceId: parentSpace.id },
        include: {
          assignments: {
            where: { endDate: null },
            include: { user: { select: { id: true, name: true, image: true } } },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const vizRoles = roles.map((r) => ({
    id: r.id,
    name: r.name,
    holder: r.assignments[0]?.user ?? null,
  }));

  const vizSpaces = spaces.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type as "circle" | "instance" | "project",
    leader: s.members[0]?.user ?? null,
    childCount: s._count.children,
    roleCount: s._count.roles,
  }));

  return (
    <AppShell>
      <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
        {/* Header + breadcrumb */}
        <div className="mb-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {parentSpace ? parentSpace.name : "Cercles & Instances"}
            </h1>
            {(parentSpace || parentId) && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                <a href="/circles" className="hover:text-gray-300 transition-colors">
                  Racine
                </a>
                {parentSpace?.parent && (
                  <>
                    <span>›</span>
                    <a
                      href={`/circles?parent=${parentSpace.parent.id}`}
                      className="hover:text-gray-300 transition-colors"
                    >
                      {parentSpace.parent.name}
                    </a>
                  </>
                )}
                {parentSpace && (
                  <>
                    <span>›</span>
                    <span className="text-gray-400">{parentSpace.name}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600">
            {vizSpaces.length} espace{vizSpaces.length !== 1 ? "s" : ""}
          </p>
        </div>

        {vizSpaces.length === 0 && vizRoles.length === 0 ? (
          <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 flex items-center justify-center">
            <p className="text-sm text-gray-600">
              {parentSpace
                ? `Aucun sous-espace ni rôle dans ${parentSpace.name}.`
                : "Aucun espace. Créez-en depuis la page Espaces."}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <CircleViz
              spaces={vizSpaces}
              roles={vizRoles}
              currentUserId={session.user.id}
              brandColor={org.primaryColor ?? "#6366f1"}
              orgName={parentSpace?.name ?? org.name}
              parentId={parentId ?? null}
              parentSpaceId={parentSpace?.id ?? null}
              upHref={
                parentId
                  ? parentSpace?.parent
                    ? `/circles?parent=${parentSpace.parent.id}`
                    : "/circles"
                  : null
              }
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

"use server";

import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";
import { viewerFrom, visibleMeetingWhere, visibleSpaceWhere } from "@/lib/visibility";

export type SearchResults = {
  circles: { id: string; name: string; type: string }[];
  roles: { id: string; name: string; spaceId: string; spaceName: string; holder: string | null }[];
  members: { id: string; name: string | null; email: string; image: string | null }[];
  meetings: { id: string; title: string | null; spaceName: string; date: string; status: string }[];
};

const EMPTY: SearchResults = { circles: [], roles: [], members: [], meetings: [] };

export async function searchOrg(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const ctx = await requireOrg();
  const { org } = ctx;
  const viewer = viewerFrom(ctx);
  const contains = { contains: q, mode: "insensitive" as const };

  // Espaces et rôles étaient rendus sans filtre de confidentialité : la palette
  // révélait le nom d'un cercle privé, ses rôles et leurs titulaires.
  const [spaces, roles, members, meetings] = await Promise.all([
    prisma.space.findMany({
      where: { ...visibleSpaceWhere(viewer), name: contains },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    prisma.role.findMany({
      where: { space: visibleSpaceWhere(viewer), name: contains },
      include: {
        space: { select: { id: true, name: true } },
        assignments: {
          where: { endDate: null },
          include: { user: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
      take: 6,
    }),
    prisma.organisationMember.findMany({
      where: {
        organisationId: org.id,
        user: { OR: [{ name: contains }, { email: contains }] },
      },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      take: 5,
    }),
    prisma.meeting.findMany({
      where: {
        ...visibleMeetingWhere(viewer),
        AND: [{ OR: [{ title: contains }, { space: { name: contains } }] }],
      },
      include: { space: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  return {
    circles: spaces,
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      spaceId: r.space.id,
      spaceName: r.space.name,
      holder: r.assignments[0]?.user.name ?? null,
    })),
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    })),
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      spaceName: m.space.name,
      date: m.date.toISOString(),
      status: m.status,
    })),
  };
}

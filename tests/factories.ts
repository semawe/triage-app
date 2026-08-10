import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

export async function resetDb() {
  // Ordre imposé par les clés étrangères ; TRUNCATE CASCADE suffit ici.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Output", "AgendaItem", "MeetingGuest", "IndicatorValue", "ChecklistCheck",
      "Meeting", "ProjectTask", "Project", "Indicator", "ChecklistItem",
      "RoleAssignment", "Role", "Policy", "SpaceMember", "Space",
      "PendingInvite", "JoinRequest", "OrganisationMember", "SuperAdmin",
      "Organisation", "Session", "Account", "User", "StripeEvent"
    RESTART IDENTITY CASCADE
  `);
}

export async function makeUser(email = `u-${randomUUID()}@example.com`) {
  return prisma.user.create({ data: { email, name: email.split("@")[0] } });
}

export async function makeOrg(features: Record<string, boolean> = { confidentiality: true }) {
  return prisma.organisation.create({
    data: {
      name: `Org ${randomUUID().slice(0, 6)}`,
      slug: randomUUID().slice(0, 12),
      features,
      subscriptionStatus: "active",
      seatCount: 10,
    },
  });
}

export async function addMember(orgId: string, userId: string, role: "admin" | "member" = "member") {
  return prisma.organisationMember.create({
    data: { organisationId: orgId, userId, role },
  });
}

export async function makeSpace(orgId: string, isPrivate = false) {
  return prisma.space.create({
    data: { organisationId: orgId, name: `Cercle ${randomUUID().slice(0, 6)}`, type: "circle", isPrivate },
  });
}

export async function addSpaceMember(spaceId: string, userId: string, role: "lead" | "member" = "member") {
  return prisma.spaceMember.create({ data: { spaceId, userId, role } });
}

export async function makeMeeting(
  spaceId: string,
  opts: { isPrivate?: boolean | null; status?: "draft" | "open" | "closed"; createdById?: string } = {}
) {
  return prisma.meeting.create({
    data: {
      spaceId,
      title: "Réunion de test",
      date: new Date(),
      isPrivate: opts.isPrivate ?? null,
      status: opts.status ?? "draft",
      createdById: opts.createdById,
    },
  });
}

export async function makeAgendaItem(meetingId: string, authorId: string, order = 1, status: "pending" | "active" | "done" = "pending") {
  return prisma.agendaItem.create({
    data: { meetingId, authorId, title: `Point ${order}`, order, status },
  });
}

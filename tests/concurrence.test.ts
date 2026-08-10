/**
 * Test 5 — Invariants sous concurrence.
 *
 * Les transitions d'agenda enchaînaient lecture puis écriture hors transaction :
 * deux facilitateurs simultanés pouvaient activer deux points. Les gardes de
 * sièges comptaient hors de la transaction d'écriture.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies } from "./setup";
import {
  addMember, addSpaceMember, makeAgendaItem, makeMeeting, makeOrg, makeSpace,
  makeUser, prisma, resetDb,
} from "./factories";
import { completeSyncPhase, nextItem } from "@/actions/meeting";
import { generateInvite } from "@/actions/member";
import { approveJoinRequest } from "@/actions/join";

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
});

async function openMeetingWithItems(count: number, syncPhase = false) {
  const org = await makeOrg({ confidentiality: false, sync_phase: syncPhase });
  const user = await makeUser();
  await addMember(org.id, user.id, "admin");
  const space = await makeSpace(org.id);
  await addSpaceMember(space.id, user.id, "lead");
  const meeting = await makeMeeting(space.id, { status: "open", createdById: user.id });
  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push(await makeAgendaItem(meeting.id, user.id, i, i === 1 && !syncPhase ? "active" : "pending"));
  }
  currentCookies.set("triage-active-org", org.id);
  actAs(user);
  return { org, user, meeting, items };
}

async function activeCount(meetingId: string) {
  return prisma.agendaItem.count({ where: { meetingId, status: "active" } });
}

describe("transitions d'agenda concurrentes", () => {
  it("laisse au plus un point actif après deux nextItem simultanés", async () => {
    const s = await openMeetingWithItems(4);
    await Promise.allSettled([
      nextItem(s.meeting.id, s.items[0].id),
      nextItem(s.meeting.id, s.items[0].id),
    ]);
    expect(await activeCount(s.meeting.id)).toBeLessThanOrEqual(1);
    // Un seul point a été traité : le second appel ne doit pas avoir sauté un point.
    expect(await prisma.agendaItem.count({ where: { meetingId: s.meeting.id, status: "done" } })).toBe(1);
  });

  it("laisse au plus un point actif après deux completeSyncPhase simultanés", async () => {
    const s = await openMeetingWithItems(3, true);
    await Promise.allSettled([
      completeSyncPhase(s.meeting.id),
      completeSyncPhase(s.meeting.id),
    ]);
    expect(await activeCount(s.meeting.id)).toBeLessThanOrEqual(1);
  });

  it("interdit deux points actifs même par écriture directe en base", async () => {
    const s = await openMeetingWithItems(2);
    await expect(
      prisma.agendaItem.update({ where: { id: s.items[1].id }, data: { status: "active" } })
    ).rejects.toThrow();
  });
});

describe("gardes de sièges", () => {
  it("n'émet pas deux invitations sur le dernier siège", async () => {
    const org = await makeOrg({});
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    // 1 membre + 1 siège libre
    await prisma.organisation.update({ where: { id: org.id }, data: { seatCount: 2 } });
    currentCookies.set("triage-active-org", org.id);
    actAs(admin);

    const fd = () => {
      const f = new FormData();
      f.set("role", "member");
      return f;
    };
    await Promise.allSettled([generateInvite(null, fd()), generateInvite(null, fd())]);

    const invites = await prisma.pendingInvite.count({ where: { orgId: org.id } });
    const members = await prisma.organisationMember.count({ where: { organisationId: org.id } });
    expect(members + invites).toBeLessThanOrEqual(2);
  });

  it("n'approuve pas deux adhésions sur le dernier siège", async () => {
    const org = await makeOrg({});
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    await prisma.organisation.update({
      where: { id: org.id },
      data: { seatCount: 2, allowedEmailDomain: "example.com" },
    });
    const a = await makeUser();
    const b = await makeUser();
    const reqA = await prisma.joinRequest.create({ data: { userId: a.id, organisationId: org.id, status: "pending" } });
    const reqB = await prisma.joinRequest.create({ data: { userId: b.id, organisationId: org.id, status: "pending" } });

    currentCookies.set("triage-active-org", org.id);
    actAs(admin);
    await Promise.allSettled([approveJoinRequest(reqA.id), approveJoinRequest(reqB.id)]);

    const members = await prisma.organisationMember.count({ where: { organisationId: org.id } });
    expect(members).toBeLessThanOrEqual(2);
  });
});

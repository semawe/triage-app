/**
 * Test 1 — Isolation d'une réunion privée.
 *
 * Un membre de l'organisation extérieur à l'espace ne doit obtenir ni accès en
 * lecture, ni effet de bord par Server Action. Avant correction,
 * `requireMeetingAccess` ne regardait que l'appartenance à l'org : toutes les
 * mutations de réunion passaient.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies } from "./setup";
import {
  addMember, addSpaceMember, makeAgendaItem, makeMeeting, makeOrg, makeSpace,
  makeUser, prisma, resetDb,
} from "./factories";
import { requireMeetingAccess } from "@/lib/session";
import { closeMeeting, updateMeetingTitle, updateMeetingPrivacy, nextItem } from "@/actions/meeting";
import { searchOrg } from "@/actions/search";

async function scenario(opts: { spacePrivate?: boolean; meetingPrivate?: boolean | null; confidentiality?: boolean } = {}) {
  const org = await makeOrg({ confidentiality: opts.confidentiality ?? true });
  const insider = await makeUser();
  const outsider = await makeUser();
  const admin = await makeUser();
  await addMember(org.id, insider.id);
  await addMember(org.id, outsider.id);
  await addMember(org.id, admin.id, "admin");

  const space = await makeSpace(org.id, opts.spacePrivate ?? true);
  await addSpaceMember(space.id, insider.id, "lead");

  const meeting = await makeMeeting(space.id, {
    isPrivate: opts.meetingPrivate ?? null,
    status: "open",
    createdById: insider.id,
  });
  const item = await makeAgendaItem(meeting.id, insider.id, 1, "active");

  currentCookies.set("triage-active-org", org.id);
  return { org, insider, outsider, admin, space, meeting, item };
}

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
});

describe("réunion dans un cercle privé", () => {
  it("refuse l'accès à un membre de l'org extérieur au cercle", async () => {
    const s = await scenario();
    actAs(s.outsider);
    expect(await requireMeetingAccess(s.meeting.id)).toBeNull();
  });

  it("l'autorise au membre du cercle, à l'admin de l'org et à l'hôte", async () => {
    const s = await scenario();
    for (const user of [s.insider, s.admin]) {
      actAs(user);
      expect(await requireMeetingAccess(s.meeting.id)).not.toBeNull();
    }
  });

  it("ne laisse passer aucune mutation de réunion depuis l'extérieur", async () => {
    const s = await scenario();
    actAs(s.outsider);

    await updateMeetingTitle(s.meeting.id, new FormData());
    await updateMeetingPrivacy(s.meeting.id, false);
    await nextItem(s.meeting.id, s.item.id);
    await closeMeeting(s.meeting.id);

    const after = await prisma.meeting.findUniqueOrThrow({ where: { id: s.meeting.id } });
    expect(after.status).toBe("open");
    expect(after.title).toBe("Réunion de test");
    expect(after.isPrivate).toBeNull();

    const itemAfter = await prisma.agendaItem.findUniqueOrThrow({ where: { id: s.item.id } });
    expect(itemAfter.status).toBe("active");
  });

  it("laisse passer la mutation depuis un membre du cercle", async () => {
    const s = await scenario();
    actAs(s.insider);
    await closeMeeting(s.meeting.id);
    const after = await prisma.meeting.findUniqueOrThrow({ where: { id: s.meeting.id } });
    expect(after.status).toBe("closed");
  });

  it("respecte l'override : réunion privée dans un cercle public", async () => {
    const s = await scenario({ spacePrivate: false, meetingPrivate: true });
    actAs(s.outsider);
    expect(await requireMeetingAccess(s.meeting.id)).toBeNull();
  });

  it("respecte l'override inverse : réunion publique dans un cercle privé", async () => {
    const s = await scenario({ spacePrivate: true, meetingPrivate: false });
    actAs(s.outsider);
    expect(await requireMeetingAccess(s.meeting.id)).not.toBeNull();
  });

  it("ne verrouille rien quand le module confidentialité est éteint", async () => {
    const s = await scenario({ confidentiality: false });
    actAs(s.outsider);
    expect(await requireMeetingAccess(s.meeting.id)).not.toBeNull();
  });
});

describe("recherche transverse (palette Cmd+K)", () => {
  it("masque le cercle privé, ses rôles et ses réunions à un extérieur", async () => {
    const s = await scenario();
    await prisma.space.update({ where: { id: s.space.id }, data: { name: "Zorglub" } });
    await prisma.role.create({ data: { spaceId: s.space.id, name: "Zorglub Secret" } });
    await prisma.meeting.update({ where: { id: s.meeting.id }, data: { title: "Zorglub réunion" } });

    actAs(s.outsider);
    const outsiderResults = await searchOrg("Zorglub");
    expect(outsiderResults.circles).toHaveLength(0);
    expect(outsiderResults.roles).toHaveLength(0);
    expect(outsiderResults.meetings).toHaveLength(0);

    actAs(s.insider);
    const insiderResults = await searchOrg("Zorglub");
    expect(insiderResults.circles).toHaveLength(1);
    expect(insiderResults.roles).toHaveLength(1);
    expect(insiderResults.meetings).toHaveLength(1);
  });
});

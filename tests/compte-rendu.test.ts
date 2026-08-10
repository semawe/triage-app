/**
 * Test 2 — Diffusion d'un compte-rendu.
 *
 * Avant correction, tout membre de l'organisation pouvait déclencher l'envoi
 * du CR de n'importe quelle réunion, à TOUS les membres de l'organisation —
 * y compris le contenu d'une réunion confidentielle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies, sentEmails } from "./setup";
import {
  addMember, addSpaceMember, makeAgendaItem, makeMeeting, makeOrg, makeSpace,
  makeUser, prisma, resetDb,
} from "./factories";
import { sendMeetingRecap } from "@/actions/email";

async function scenario(spacePrivate: boolean) {
  const org = await makeOrg({ confidentiality: true, recap_email: true });
  const host = await makeUser("host@example.com");
  const insider = await makeUser("insider@example.com");
  const outsider = await makeUser("outsider@example.com");
  await addMember(org.id, host.id);
  await addMember(org.id, insider.id);
  await addMember(org.id, outsider.id);

  const space = await makeSpace(org.id, spacePrivate);
  await addSpaceMember(space.id, host.id, "lead");
  await addSpaceMember(space.id, insider.id);

  const meeting = await makeMeeting(space.id, { status: "closed", createdById: host.id });
  const item = await makeAgendaItem(meeting.id, host.id, 1, "done");
  await prisma.output.create({
    data: {
      item: { connect: { id: item.id } },
      author: { connect: { id: host.id } },
      type: "decision",
      content: "Décision confidentielle",
    },
  });

  currentCookies.set("triage-active-org", org.id);
  return { org, host, insider, outsider, space, meeting };
}

function form(meetingId: string) {
  const fd = new FormData();
  fd.set("meetingId", meetingId);
  return fd;
}

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
  sentEmails.length = 0;
});

describe("compte-rendu email", () => {
  it("refuse l'envoi à un membre de l'org extérieur au cercle privé", async () => {
    const s = await scenario(true);
    actAs(s.outsider);
    const res = await sendMeetingRecap(null, form(s.meeting.id));
    expect(res.ok).toBe(false);
    expect(sentEmails).toHaveLength(0);
  });

  it("refuse l'envoi à un membre du cercle qui n'est ni hôte, ni lead, ni admin", async () => {
    const s = await scenario(true);
    actAs(s.insider);
    const res = await sendMeetingRecap(null, form(s.meeting.id));
    expect(res.ok).toBe(false);
    expect(sentEmails).toHaveLength(0);
  });

  it("n'adresse le CR d'une réunion confidentielle qu'aux membres du cercle", async () => {
    const s = await scenario(true);
    actAs(s.host);
    const res = await sendMeetingRecap(null, form(s.meeting.id));
    expect(res.ok).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].sort()).toEqual(["host@example.com", "insider@example.com"]);
    expect(sentEmails[0]).not.toContain("outsider@example.com");
  });

  it("adresse le CR d'une réunion publique à toute l'organisation", async () => {
    const s = await scenario(false);
    actAs(s.host);
    await sendMeetingRecap(null, form(s.meeting.id));
    expect(sentEmails[0].sort()).toEqual([
      "host@example.com", "insider@example.com", "outsider@example.com",
    ]);
  });

  it("échappe le nom de l'espace au lieu de l'injecter brut dans le HTML", async () => {
    const s = await scenario(false);
    await prisma.space.update({
      where: { id: s.space.id },
      data: { name: '<img src=x onerror="alert(1)">' },
    });
    actAs(s.host);
    const { sendEmail } = await import("@/lib/email");
    await sendMeetingRecap(null, form(s.meeting.id));
    const call = (sendEmail as unknown as { mock: { calls: [{ html: string; subject: string }][] } }).mock.calls.at(-1)!;
    expect(call[0].html).not.toContain("<img src=x");
    expect(call[0].html).toContain("&lt;img src=x");
  });
});

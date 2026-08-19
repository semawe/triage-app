/**
 * La réunion en cours — le lot 3 de la revue adverse du 18/08/2026.
 *
 * Ces défauts n'exposent rien et ne coûtent pas d'argent : ils abîment la réunion
 * pendant qu'elle a lieu. Une note qui disparaît sans un mot, un état que deux
 * participants voient différemment, un compte-rendu promis puis jamais envoyé. En
 * réunion, une divergence silencieuse produit des décisions prises sur des états
 * différents, ce qui est plus dommageable qu'une erreur affichée.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies, sentEmails } from "./setup";
import {
  addMember, addSpaceMember, makeAgendaItem, makeMeeting, makeOrg, makeSpace,
  makeUser, prisma, resetDb,
} from "./factories";
import { addOutput } from "@/actions/output";
import { closeMeeting, jumpToItem, nextItem, openMeeting } from "@/actions/meeting";
import { sendMeetingRecap } from "@/actions/email";
import { newToken } from "@/lib/tokens";

async function reunion(statut: "draft" | "open" | "closed" = "open") {
  const org = await makeOrg({});
  const hote = await makeUser();
  const autre = await makeUser();
  await addMember(org.id, hote.id, "admin");
  await addMember(org.id, autre.id);
  const espace = await makeSpace(org.id);
  await addSpaceMember(espace.id, hote.id, "lead");
  const m = await makeMeeting(espace.id, { status: statut, createdById: hote.id });
  await prisma.meeting.update({ where: { id: m.id }, data: { scribeId: hote.id } });
  const p1 = await makeAgendaItem(m.id, hote.id, 1, statut === "open" ? "active" : "pending");
  const p2 = await makeAgendaItem(m.id, hote.id, 2, "pending");
  currentCookies.set("triage-active-org", org.id);
  return { org, hote, autre, espace, meeting: m, p1, p2 };
}

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
  sentEmails.length = 0;
});

describe("une saisie refusée n'est pas perdue en silence", () => {
  const saisie = (itemId: string) => {
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("type", "note");
    fd.set("content", "Note du facilitateur");
    return fd;
  };

  it("dit pourquoi elle refuse quand le stylo a changé de main", async () => {
    const s = await reunion();
    actAs(s.autre); // n'est pas le scribe
    const r = await addOutput(saisie(s.p1.id));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toBe("refus");
    expect(r.ok === false && r.message).toMatch(/scribe/i);
    expect(await prisma.output.count()).toBe(0);
  });

  it("confirme quand elle accepte", async () => {
    const s = await reunion();
    actAs(s.hote);
    expect((await addOutput(saisie(s.p1.id))).ok).toBe(true);
    expect(await prisma.output.count()).toBe(1);
  });

  it("distingue une saisie invalide d'un refus de droit", async () => {
    const s = await reunion();
    actAs(s.hote);
    const fd = new FormData();
    fd.set("itemId", s.p1.id);
    fd.set("type", "note");
    fd.set("content", "   "); // vide après trim
    const r = await addOutput(fd);
    expect(r.ok === false && r.motif).toBe("invalide");
  });
});

describe("les transitions de réunion refusent les états impossibles", () => {
  it("ne rouvre pas une réunion close", async () => {
    const s = await reunion("closed");
    actAs(s.hote);
    await openMeeting(s.meeting.id);
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: s.meeting.id } })).status).toBe(
      "closed"
    );
  });

  it("ouvre bien un brouillon — le refus n'est pas un scénario cassé", async () => {
    const s = await reunion("draft");
    actAs(s.hote);
    await openMeeting(s.meeting.id);
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: s.meeting.id } })).status).toBe(
      "open"
    );
  });

  it("n'active aucun point dans une réunion close", async () => {
    const s = await reunion("closed");
    actAs(s.hote);
    await jumpToItem(s.meeting.id, s.p2.id);
    expect(await prisma.agendaItem.count({ where: { meetingId: s.meeting.id, status: "active" } })).toBe(0);
  });

  it("n'avance pas l'ordre du jour d'une réunion close", async () => {
    const s = await reunion();
    actAs(s.hote);
    await closeMeeting(s.meeting.id);
    await nextItem(s.meeting.id, s.p1.id);
    expect(await prisma.agendaItem.count({ where: { meetingId: s.meeting.id, status: "active" } })).toBe(0);
  });

  it("n'avance pas l'agenda d'une réunion close portant encore un point actif", async () => {
    // Cet état incohérent — close ET point actif — est celui que la course
    // d'avant la correction pouvait produire, et il existe donc peut-être en base.
    // La précondition doit refuser d'y toucher, sans quoi elle serait redondante
    // avec le `status: "active"` de `nextItem` : c'est ce test qui la rend porteuse
    // (constaté en la retirant : sans ce cas, aucun test ne la réclamait).
    const s = await reunion();
    await prisma.meeting.update({ where: { id: s.meeting.id }, data: { status: "closed" } });

    actAs(s.hote);
    await nextItem(s.meeting.id, s.p1.id);

    // Le point 1 reste actif, le point 2 n'a pas été activé : rien n'a bougé.
    expect((await prisma.agendaItem.findUniqueOrThrow({ where: { id: s.p1.id } })).status).toBe("active");
    expect((await prisma.agendaItem.findUniqueOrThrow({ where: { id: s.p2.id } })).status).toBe("pending");
  });

  it("ne laisse jamais une réunion close avec un point actif, même sous concurrence", async () => {
    const s = await reunion();
    actAs(s.hote);
    await Promise.allSettled([closeMeeting(s.meeting.id), nextItem(s.meeting.id, s.p1.id)]);

    const m = await prisma.meeting.findUniqueOrThrow({ where: { id: s.meeting.id } });
    const actifs = await prisma.agendaItem.count({
      where: { meetingId: s.meeting.id, status: "active" },
    });
    if (m.status === "closed") expect(actifs).toBe(0);
  });

  it("révoque les liens invités dans la même transaction que la clôture", async () => {
    const s = await reunion();
    const invite = await makeUser();
    await prisma.meetingGuest.create({
      data: { meetingId: s.meeting.id, email: invite.email!, token: newToken() },
    });
    actAs(s.hote);
    await closeMeeting(s.meeting.id);
    const g = await prisma.meetingGuest.findFirstOrThrow({ where: { meetingId: s.meeting.id } });
    expect(g.revokedAt).not.toBeNull();
  });
});

describe("compte-rendu de réunion", () => {
  it("atteint les invités même après la clôture, qui a révoqué leurs liens", async () => {
    const s = await reunion();
    await prisma.meetingGuest.create({
      data: { meetingId: s.meeting.id, email: "invite-cr@example.test", token: newToken() },
    });
    actAs(s.hote);
    await closeMeeting(s.meeting.id); // révoque les liens, comme en usage réel
    const fd = new FormData();
    fd.set("meetingId", s.meeting.id);
    await sendMeetingRecap(null, fd);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toContain("invite-cr@example.test");
  });
});

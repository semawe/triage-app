/**
 * Le cloisonnement des sorties de réunion — la porte de derrière de la revue
 * adverse du 18/08/2026.
 *
 * `tests/confidentialite.test.ts` établit qu'un membre extérieur à un cercle privé
 * n'atteint ni la réunion ni ses mutations. Il ne disait rien d'un chemin plus
 * discret : **assigner** une action à cette personne. Le contenu de la sortie, le
 * titre de la réunion et le nom du cercle confidentiel lui étaient alors servis sur
 * `/actions` et `/me`, dont les requêtes ne filtraient que sur l'organisation.
 *
 * Deux moitiés à tenir, et les deux sont ici : le serveur refuse l'assignation
 * illégitime, et la requête d'affichage cloisonne de toute façon — parce qu'une
 * sortie assignée avant la correction existe encore en base.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies } from "./setup";
import {
  addMember, addSpaceMember, makeAgendaItem, makeMeeting, makeOrg, makeSpace,
  makeUser, prisma, resetDb,
} from "./factories";
import { addOutput, updateOutput } from "@/actions/output";
import { viewerFrom, visibleOutputWhere, peutVoirLaReunion } from "@/lib/visibility";

async function cercleConfidentiel(opts: { confidentiality?: boolean } = {}) {
  const org = await makeOrg({ confidentiality: opts.confidentiality ?? true });
  const scribe = await makeUser();
  const dedans = await makeUser();
  const dehors = await makeUser();
  const admin = await makeUser();
  await addMember(org.id, scribe.id);
  await addMember(org.id, dedans.id);
  await addMember(org.id, dehors.id);
  await addMember(org.id, admin.id, "admin");

  const espace = await makeSpace(org.id, true); // privé
  await addSpaceMember(espace.id, scribe.id, "lead");
  await addSpaceMember(espace.id, dedans.id);

  const reunion = await makeMeeting(espace.id, { status: "open", createdById: scribe.id });
  await prisma.meeting.update({ where: { id: reunion.id }, data: { scribeId: scribe.id } });
  const point = await makeAgendaItem(reunion.id, scribe.id, 1, "active");

  currentCookies.set("triage-active-org", org.id);
  return { org, scribe, dedans, dehors, admin, espace, reunion, point };
}

const saisie = (itemId: string, contenu: string, assigneeId?: string) => {
  const fd = new FormData();
  fd.set("itemId", itemId);
  fd.set("type", "action");
  fd.set("content", contenu);
  if (assigneeId) fd.set("assigneeId", assigneeId);
  return fd;
};

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
});

describe("assigner une action hors du cercle privé", () => {
  it("est refusé", async () => {
    const s = await cercleConfidentiel();
    actAs(s.scribe);
    await addOutput(saisie(s.point.id, "Sujet sensible", s.dehors.id));
    expect(await prisma.output.count()).toBe(0);
  });

  it("est accepté vers un membre du cercle — le refus n'est pas un scénario cassé", async () => {
    const s = await cercleConfidentiel();
    actAs(s.scribe);
    await addOutput(saisie(s.point.id, "Sujet sensible", s.dedans.id));
    expect(await prisma.output.count()).toBe(1);
  });

  it("est accepté vers l'admin de l'organisation, qui traverse le cloisonnement", async () => {
    const s = await cercleConfidentiel();
    actAs(s.scribe);
    await addOutput(saisie(s.point.id, "Sujet sensible", s.admin.id));
    expect(await prisma.output.count()).toBe(1);
  });

  it("est refusé vers quelqu'un qui n'est pas même membre de l'organisation", async () => {
    const s = await cercleConfidentiel();
    const etranger = await makeUser();
    actAs(s.scribe);
    await addOutput(saisie(s.point.id, "Sujet sensible", etranger.id));
    expect(await prisma.output.count()).toBe(0);
  });

  it("reste permis quand le module confidentialité est éteint", async () => {
    const s = await cercleConfidentiel({ confidentiality: false });
    actAs(s.scribe);
    await addOutput(saisie(s.point.id, "Rien de secret", s.dehors.id));
    expect(await prisma.output.count()).toBe(1);
  });

  it("ne se rouvre pas par la réassignation", async () => {
    const s = await cercleConfidentiel();
    actAs(s.scribe);
    await addOutput(saisie(s.point.id, "Sujet sensible", s.dedans.id));
    const sortie = await prisma.output.findFirstOrThrow();

    const fd = new FormData();
    fd.set("type", "action");
    fd.set("content", "Sujet sensible");
    fd.set("assigneeId", s.dehors.id);
    await updateOutput(sortie.id, fd);

    expect((await prisma.output.findUniqueOrThrow({ where: { id: sortie.id } })).assigneeId).toBe(
      s.dedans.id
    );
  });
});

describe("la requête d'affichage cloisonne, même sur une sortie déjà en base", () => {
  /** Écrit une sortie en contournant l'action : l'état d'avant la correction. */
  async function sortieHeritee(itemId: string, assigneeId: string, authorId: string) {
    return prisma.output.create({
      data: { itemId, authorId, type: "action", content: "Fuite héritée", assigneeId },
    });
  }

  it("masque à l'extérieur du cercle une action qui lui est assignée", async () => {
    const s = await cercleConfidentiel();
    await sortieHeritee(s.point.id, s.dehors.id, s.scribe.id);

    const viewer = viewerFrom({
      session: { user: { id: s.dehors.id } },
      org: s.org,
      membership: { role: "member" },
    });
    const vues = await prisma.output.findMany({
      where: { type: "action", assigneeId: s.dehors.id, ...visibleOutputWhere(viewer) },
    });
    expect(vues).toEqual([]);
  });

  it("la laisse voir à un membre du cercle", async () => {
    const s = await cercleConfidentiel();
    await sortieHeritee(s.point.id, s.dedans.id, s.scribe.id);

    const viewer = viewerFrom({
      session: { user: { id: s.dedans.id } },
      org: s.org,
      membership: { role: "member" },
    });
    const vues = await prisma.output.findMany({
      where: { type: "action", assigneeId: s.dedans.id, ...visibleOutputWhere(viewer) },
    });
    expect(vues).toHaveLength(1);
  });
});

/**
 * La décision unique, éprouvée directement : c'est elle que quatre appelants
 * partagent désormais, donc une régression ici les casse tous les quatre à la fois.
 * C'est le prix de la déduplication, et la raison de ce bloc.
 */
describe("peutVoirLaReunion — la décision partagée", () => {
  it("refuse l'extérieur, accepte le membre du cercle, l'admin et l'hôte", async () => {
    const s = await cercleConfidentiel();
    const reunion = await prisma.meeting.findUniqueOrThrow({
      where: { id: s.reunion.id },
      include: { space: true },
    });
    const decision = (userId: string, role: string) =>
      peutVoirLaReunion({
        meeting: reunion,
        space: reunion.space,
        enabled: true,
        userId,
        role,
      });

    expect(await decision(s.dehors.id, "member")).toBe(false);
    expect(await decision(s.dedans.id, "member")).toBe(true);
    expect(await decision(s.admin.id, "admin")).toBe(true);
    expect(await decision(s.scribe.id, "member")).toBe(true); // hôte
  });

  it("ne cloisonne rien quand le module est éteint", async () => {
    const s = await cercleConfidentiel();
    const reunion = await prisma.meeting.findUniqueOrThrow({
      where: { id: s.reunion.id },
      include: { space: true },
    });
    expect(
      await peutVoirLaReunion({
        meeting: reunion,
        space: reunion.space,
        enabled: false,
        userId: s.dehors.id,
        role: "member",
      })
    ).toBe(true);
  });
});

/**
 * Les gardes d'autorisation, éprouvées sur ce qu'elles refusent.
 *
 * `tests/gardes.test.ts` établit que chaque porte atteint UNE garde ; il ne peut
 * pas établir qu'elle atteint LA BONNE. C'est ce fichier qui s'en charge, sur les
 * deux endroits que le brief du chantier désigne — là où une erreur expose les
 * données d'un autre client, et là où elle coûte de l'argent.
 *
 * Chaque cas est écrit en négatif : on fait agir quelqu'un qui n'a pas le droit,
 * et on vérifie que la base n'a pas bougé. Un test qui n'observe que le chemin
 * autorisé ne dit rien de la garde — il dit seulement que la fonction fonctionne.
 * Les deux moitiés y sont donc à chaque fois : le refus, et l'accord qui prouve
 * que le refus ne vient pas d'un scénario cassé.
 *
 * Le cas le plus important du fichier est le franchissement d'organisation. Un
 * lead de cercle légitime CHEZ LUI dispose d'un rôle ; si la garde ne vérifie que
 * ce rôle sans vérifier l'organisation, il devient lead partout. C'est la seule
 * faute de cette famille qui expose les données d'un client à un autre, et rien
 * dans l'interface ne la rendrait visible.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies, RedirectError } from "./setup";
import {
  addMember, addSpaceMember, makeAgendaItem, makeMeeting, makeOrg, makeSpace,
  makeUser, prisma, resetDb,
} from "./factories";
import { canManageSpace } from "@/lib/authz";
import { createRole, updateSpaceGovernance } from "@/actions/governance";
import { createIndicator } from "@/actions/indicator";
import { createProject } from "@/actions/project";
import { createProjectTask, deleteProjectTask } from "@/actions/projectTask";
import { updateOrgBranding, updateOrgDomain, updateOrgFeature, switchOrg } from "@/actions/org";
import { adminDeleteOrg, adminSetOrgSubscription, adminSetMemberRole } from "@/actions/admin";
import { updateMemberRole, removeMember } from "@/actions/member";
import { addOutput } from "@/actions/output";
import { updateSeats } from "@/actions/billing";

/**
 * Deux organisations complètes, montées en parallèle. La seconde n'est pas
 * décorative : sans elle, aucun test de franchissement n'est possible.
 */
async function deuxOrganisations() {
  const orgA = await makeOrg({});
  const orgB = await makeOrg({});

  const adminA = await makeUser();
  const membreA = await makeUser(); // membre de A, sans rôle d'espace
  const leadA = await makeUser();
  const adminB = await makeUser();
  const leadB = await makeUser(); // lead CHEZ LUI, étranger à A

  await addMember(orgA.id, adminA.id, "admin");
  await addMember(orgA.id, membreA.id);
  await addMember(orgA.id, leadA.id);
  await addMember(orgB.id, adminB.id, "admin");
  await addMember(orgB.id, leadB.id);

  const espaceA = await makeSpace(orgA.id);
  const autreEspaceA = await makeSpace(orgA.id);
  const espaceB = await makeSpace(orgB.id);
  await addSpaceMember(espaceA.id, leadA.id, "lead");
  await addSpaceMember(espaceB.id, leadB.id, "lead");

  currentCookies.set("triage-active-org", orgA.id);
  return { orgA, orgB, adminA, membreA, leadA, adminB, leadB, espaceA, autreEspaceA, espaceB };
}

/** Exécute une action et avale la redirection que lèvent les gardes de session. */
async function tente(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (e) {
    if (!(e instanceof RedirectError)) throw e;
  }
}

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
});

describe("canManageSpace — admin d'org ou lead du cercle, et personne d'autre", () => {
  it("refuse un membre ordinaire de l'organisation", async () => {
    const s = await deuxOrganisations();
    actAs(s.membreA);
    expect((await canManageSpace(s.espaceA.id)).ok).toBe(false);
  });

  it("accorde au lead du cercle et à l'admin de l'organisation", async () => {
    const s = await deuxOrganisations();
    for (const u of [s.leadA, s.adminA]) {
      actAs(u);
      expect((await canManageSpace(s.espaceA.id)).ok).toBe(true);
    }
  });

  it("refuse au lead d'un cercle voisin de la même organisation", async () => {
    const s = await deuxOrganisations();
    actAs(s.leadA);
    expect((await canManageSpace(s.autreEspaceA.id)).ok).toBe(false);
  });

  it("refuse au lead d'une AUTRE organisation, cercle et rôle authentiques", async () => {
    const s = await deuxOrganisations();
    actAs(s.leadB);
    await tente(async () => {
      expect((await canManageSpace(s.espaceA.id)).ok).toBe(false);
    });
  });

  it("refuse à l'admin d'une autre organisation", async () => {
    // Ce cas-ci isole le contrôle d'organisation de `canManageSpace` : adminB est
    // bel et bien admin — chez lui. Sans le filtre `organisationId`, son rôle
    // d'admin s'appliquerait aux cercles de tout le monde (mutation éprouvée).
    const s = await deuxOrganisations();
    actAs(s.adminB);
    await tente(async () => {
      expect((await canManageSpace(s.espaceA.id)).ok).toBe(false);
    });
  });

  it("refuse au consultant membre des deux, lead chez l'un, sur le cercle de l'autre", async () => {
    // Le cas réaliste de fuite entre clients, et le second à isoler le filtre
    // d'organisation : quelqu'un accompagne deux organisations, y est lead dans
    // l'une et simple membre dans l'autre. Le rôle de lead ne doit pas voyager.
    const s = await deuxOrganisations();
    const consultant = await makeUser();
    await addMember(s.orgA.id, consultant.id); // membre ordinaire chez A
    await addMember(s.orgB.id, consultant.id);
    await addSpaceMember(s.espaceB.id, consultant.id, "lead"); // lead chez B

    actAs(consultant);
    currentCookies.set("triage-active-org", s.orgA.id);
    expect((await canManageSpace(s.espaceB.id)).ok).toBe(false);
    // Et chez lui, son rôle vaut : le refus ci-dessus n'est pas un scénario cassé.
    currentCookies.set("triage-active-org", s.orgB.id);
    expect((await canManageSpace(s.espaceB.id)).ok).toBe(true);
  });
});

describe("ce que canManageSpace protège vraiment", () => {
  it("un membre ordinaire ne crée ni rôle, ni indicateur, ni projet", async () => {
    const s = await deuxOrganisations();
    actAs(s.membreA);

    await tente(() => createRole(s.espaceA.id, new FormData()));
    const fdRole = new FormData();
    fdRole.set("name", "Rôle interdit");
    await tente(() => createRole(s.espaceA.id, fdRole));

    const fdInd = new FormData();
    fdInd.set("name", "Indicateur interdit");
    await tente(() => createIndicator(s.espaceA.id, fdInd));

    const fdProj = new FormData();
    fdProj.set("name", "Projet interdit");
    await tente(() => createProject(s.espaceA.id, fdProj));

    expect(await prisma.role.count()).toBe(0);
    expect(await prisma.indicator.count()).toBe(0);
    expect(await prisma.project.count()).toBe(0);
  });

  it("le lead du cercle, lui, les crée — le refus ne vient pas d'un scénario cassé", async () => {
    const s = await deuxOrganisations();
    actAs(s.leadA);
    const fd = new FormData();
    fd.set("name", "Rôle légitime");
    await tente(() => createRole(s.espaceA.id, fd));
    expect(await prisma.role.count()).toBe(1);
  });

  it("un lead ne réécrit pas la raison d'être d'un cercle d'une autre organisation", async () => {
    const s = await deuxOrganisations();
    const avant = await prisma.space.findUnique({ where: { id: s.espaceA.id } });
    actAs(s.leadB);
    const fd = new FormData();
    fd.set("purpose", "Raison d'être détournée");
    await tente(() => updateSpaceGovernance(s.espaceA.id, fd));
    const apres = await prisma.space.findUnique({ where: { id: s.espaceA.id } });
    expect(apres?.purpose).toBe(avant?.purpose);
  });

  it("une tâche de projet ne s'ouvre ni ne se supprime depuis une autre organisation", async () => {
    const s = await deuxOrganisations();
    actAs(s.leadA);
    const fdProj = new FormData();
    fdProj.set("name", "Projet de A");
    await tente(() => createProject(s.espaceA.id, fdProj));
    const projet = await prisma.project.findFirstOrThrow();
    const fdTache = new FormData();
    fdTache.set("title", "Tâche de A");
    await tente(() => createProjectTask(projet.id, fdTache));
    const tache = await prisma.projectTask.findFirstOrThrow();

    actAs(s.leadB);
    const fdIntrus = new FormData();
    fdIntrus.set("title", "Tâche intruse");
    await tente(() => createProjectTask(projet.id, fdIntrus));
    await tente(() => deleteProjectTask(tache.id));

    expect(await prisma.projectTask.count()).toBe(1);
    expect((await prisma.projectTask.findUniqueOrThrow({ where: { id: tache.id } })).title).toBe("Tâche de A");
  });
});

/**
 * `src/actions/org.ts` n'emploie pas `requireOrg()` : il enchaîne `auth()` sur une
 * recherche d'appartenance écrite à la main, quatre fois. C'est le module où une
 * divergence est la plus probable, et le seul où l'`orgId` visé vient du
 * formulaire plutôt que du cookie — donc le seul qu'un appelant choisit librement.
 */
describe("les contrôles écrits à la main de src/actions/org.ts", () => {
  it("un membre ordinaire ne change pas le domaine d'auto-adhésion", async () => {
    // Le pire de la famille : `allowedEmailDomain` décide qui peut demander à
    // rejoindre l'organisation. L'ouvrir à un domaine public ouvrirait l'org.
    const s = await deuxOrganisations();
    actAs(s.membreA);
    const fd = new FormData();
    fd.set("orgId", s.orgA.id);
    fd.set("domain", "gmail.com");
    await tente(() => updateOrgDomain(fd));
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } })).allowedEmailDomain).toBeNull();
  });

  it("un admin d'une autre organisation ne change pas le domaine de celle-ci", async () => {
    const s = await deuxOrganisations();
    actAs(s.adminB);
    const fd = new FormData();
    fd.set("orgId", s.orgA.id); // l'orgId vient du formulaire, pas du cookie
    fd.set("domain", "exemple.test");
    await tente(() => updateOrgDomain(fd));
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } })).allowedEmailDomain).toBeNull();
  });

  it("un membre ordinaire ne change ni le logo ni les modules", async () => {
    const s = await deuxOrganisations();
    actAs(s.membreA);
    const fd = new FormData();
    fd.set("orgId", s.orgA.id);
    fd.set("logoUrl", "https://exemple.test/logo.png");
    fd.set("primaryColor", "#ff0000");
    await tente(() => updateOrgBranding(fd));
    await tente(() => updateOrgFeature(s.orgA.id, "confidentiality", true));

    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } });
    expect(org.logoUrl).toBeNull();
    expect(org.features).toEqual({});
  });

  it("l'admin, lui, les change — le refus ne vient pas d'un scénario cassé", async () => {
    const s = await deuxOrganisations();
    actAs(s.adminA);
    const fd = new FormData();
    fd.set("orgId", s.orgA.id);
    fd.set("logoUrl", "https://exemple.test/logo.png");
    await tente(() => updateOrgBranding(fd));
    await tente(() => updateOrgFeature(s.orgA.id, "confidentiality", true));

    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } });
    expect(org.logoUrl).toBe("https://exemple.test/logo.png");
    expect(org.features).toEqual({ confidentiality: true });
  });

  it("on ne bascule pas sur une organisation dont on n'est pas membre", async () => {
    const s = await deuxOrganisations();
    actAs(s.membreA);
    await tente(() => switchOrg(s.orgB.id));
    expect(currentCookies.get("triage-active-org")).toBe(s.orgA.id);
  });

  it("on bascule sur la sienne", async () => {
    const s = await deuxOrganisations();
    await addMember(s.orgB.id, s.membreA.id);
    actAs(s.membreA);
    await tente(() => switchOrg(s.orgB.id));
    expect(currentCookies.get("triage-active-org")).toBe(s.orgB.id);
  });
});

describe("requireSuperAdmin — la console de plateforme", () => {
  it("un admin d'organisation ne supprime pas une organisation", async () => {
    const s = await deuxOrganisations();
    actAs(s.adminA);
    await tente(() => adminDeleteOrg(s.orgA.id));
    expect(await prisma.organisation.count({ where: { id: s.orgA.id } })).toBe(1);
  });

  it("un admin d'organisation ne se rend pas l'abonnement à lui-même", async () => {
    const s = await deuxOrganisations();
    // On part d'un abonnement résilié : sinon l'assertion « toujours actif » serait
    // vraie sans que la garde n'y soit pour rien (makeOrg crée en « active »).
    await prisma.organisation.update({
      where: { id: s.orgA.id },
      data: { subscriptionStatus: "canceled" },
    });
    actAs(s.adminA);
    const fd = new FormData();
    fd.set("orgId", s.orgA.id);
    fd.set("status", "active");
    await tente(() => adminSetOrgSubscription(fd));
    expect(
      (await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } })).subscriptionStatus
    ).toBe("canceled");
  });

  it("un admin d'organisation ne promeut personne par la console de plateforme", async () => {
    const s = await deuxOrganisations();
    const cible = await prisma.organisationMember.findFirstOrThrow({
      where: { organisationId: s.orgA.id, userId: s.membreA.id },
    });
    actAs(s.adminA);
    await tente(() => adminSetMemberRole(cible.id, "admin"));
    expect((await prisma.organisationMember.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("member");
  });

  it("le super-admin de plateforme, lui, supprime — le refus vient bien du rôle", async () => {
    const s = await deuxOrganisations();
    const sa = await makeUser();
    await prisma.superAdmin.create({ data: { userId: sa.id } });
    actAs(sa);
    await tente(() => adminDeleteOrg(s.orgB.id));
    expect(await prisma.organisation.count({ where: { id: s.orgB.id } })).toBe(0);
  });
});

describe("gestion des membres — le franchissement d'organisation", () => {
  it("retire aussi les appartenances aux cercles et les rôles de cette organisation", async () => {
    const s = await deuxOrganisations();
    const cible = await prisma.organisationMember.findFirstOrThrow({
      where: { organisationId: s.orgA.id, userId: s.leadA.id },
    });
    const role = await prisma.role.create({
      data: { spaceId: s.espaceA.id, name: "Facilitateur" },
    });
    await prisma.roleAssignment.create({ data: { roleId: role.id, userId: s.leadA.id } });
    // Un rôle chez B doit survivre : le nettoyage reste strictement mono-tenant.
    const roleB = await prisma.role.create({
      data: { spaceId: s.espaceB.id, name: "Secrétaire" },
    });
    await prisma.roleAssignment.create({ data: { roleId: roleB.id, userId: s.leadA.id } });
    await addSpaceMember(s.espaceB.id, s.leadA.id);

    actAs(s.adminA);
    await tente(() => removeMember(cible.id));

    expect(await prisma.organisationMember.findUnique({ where: { id: cible.id } })).toBeNull();
    expect(await prisma.spaceMember.count({
      where: { userId: s.leadA.id, space: { organisationId: s.orgA.id } },
    })).toBe(0);
    expect(await prisma.roleAssignment.count({
      where: { userId: s.leadA.id, role: { space: { organisationId: s.orgA.id } } },
    })).toBe(0);
    expect(await prisma.spaceMember.count({
      where: { userId: s.leadA.id, space: { organisationId: s.orgB.id } },
    })).toBe(1);
    expect(await prisma.roleAssignment.count({
      where: { userId: s.leadA.id, role: { space: { organisationId: s.orgB.id } } },
    })).toBe(1);
  });

  it("un admin ne touche pas un membre d'une autre organisation", async () => {
    const s = await deuxOrganisations();
    const cibleB = await prisma.organisationMember.findFirstOrThrow({
      where: { organisationId: s.orgB.id, userId: s.leadB.id },
    });
    actAs(s.adminA); // org active : orgA
    await tente(() => updateMemberRole(cibleB.id, "admin"));
    await tente(() => removeMember(cibleB.id));

    const apres = await prisma.organisationMember.findUnique({ where: { id: cibleB.id } });
    expect(apres).not.toBeNull();
    expect(apres?.role).toBe("member");
  });

  it("un membre ordinaire ne promeut personne, pas même chez lui", async () => {
    const s = await deuxOrganisations();
    const cible = await prisma.organisationMember.findFirstOrThrow({
      where: { organisationId: s.orgA.id, userId: s.leadA.id },
    });
    actAs(s.membreA);
    await tente(() => updateMemberRole(cible.id, "admin"));
    expect((await prisma.organisationMember.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("member");
  });

  it("un admin ne se retire pas son propre rôle d'admin", async () => {
    // Sinon une organisation peut se retrouver sans personne pour l'administrer.
    const s = await deuxOrganisations();
    const soi = await prisma.organisationMember.findFirstOrThrow({
      where: { organisationId: s.orgA.id, userId: s.adminA.id },
    });
    actAs(s.adminA);
    await tente(() => updateMemberRole(soi.id, "member"));
    expect((await prisma.organisationMember.findUniqueOrThrow({ where: { id: soi.id } })).role).toBe("admin");
  });

  it("l'admin, lui, promeut chez lui — le refus vient bien du rôle et de l'org", async () => {
    const s = await deuxOrganisations();
    const cible = await prisma.organisationMember.findFirstOrThrow({
      where: { organisationId: s.orgA.id, userId: s.leadA.id },
    });
    actAs(s.adminA);
    await tente(() => updateMemberRole(cible.id, "admin"));
    expect((await prisma.organisationMember.findUniqueOrThrow({ where: { id: cible.id } })).role).toBe("admin");
  });
});

describe("saisie des sorties de réunion — réservée au scribe", () => {
  async function reunionAvecScribe() {
    const org = await makeOrg({});
    const scribe = await makeUser();
    const autre = await makeUser();
    await addMember(org.id, scribe.id);
    await addMember(org.id, autre.id);
    const espace = await makeSpace(org.id);
    const reunion = await makeMeeting(espace.id, { status: "open", createdById: scribe.id });
    await prisma.meeting.update({ where: { id: reunion.id }, data: { scribeId: scribe.id } });
    const point = await makeAgendaItem(reunion.id, scribe.id, 1, "active");
    currentCookies.set("triage-active-org", org.id);
    return { org, scribe, autre, reunion, point };
  }

  const saisie = (itemId: string, contenu: string) => {
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("type", "note");
    fd.set("content", contenu);
    return fd;
  };

  it("refuse un membre de la réunion qui n'est pas le scribe", async () => {
    const s = await reunionAvecScribe();
    actAs(s.autre);
    await tente(() => addOutput(saisie(s.point.id, "Note volée")));
    expect(await prisma.output.count()).toBe(0);
  });

  it("accepte le scribe", async () => {
    const s = await reunionAvecScribe();
    actAs(s.scribe);
    await tente(() => addOutput(saisie(s.point.id, "Note légitime")));
    expect(await prisma.output.count()).toBe(1);
  });

  it("refuse un invité porteur de jeton, qui n'a pas de session", async () => {
    const s = await reunionAvecScribe();
    const invite = await makeUser();
    const jeton = "jeton-de-test-" + invite.id;
    await prisma.meetingGuest.create({
      data: { meetingId: s.reunion.id, email: invite.email!, userId: invite.id, token: jeton },
    });
    actAs(null); // un invité n'a précisément pas de session
    currentCookies.set("triapp_guest", jeton);
    await tente(() => addOutput(saisie(s.point.id, "Note d'invité")));
    expect(await prisma.output.count()).toBe(0);
  });
});

describe("sièges facturés — updateSeats", () => {
  it("refuse un membre ordinaire", async () => {
    const s = await deuxOrganisations();
    await prisma.organisation.update({
      where: { id: s.orgA.id },
      data: { stripeSubId: "sub_test", seatCount: 5 },
    });
    actAs(s.membreA);
    await tente(() => updateSeats(s.orgA.id, 50));
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } })).seatCount).toBe(5);
  });

  it("refuse de descendre sous l'effectif, ce qui laisserait des membres non couverts", async () => {
    const s = await deuxOrganisations();
    await prisma.organisation.update({
      where: { id: s.orgA.id },
      data: { stripeSubId: "sub_test", seatCount: 5 },
    });
    // orgA compte trois membres (admin, membre, lead).
    expect(await prisma.organisationMember.count({ where: { organisationId: s.orgA.id } })).toBe(3);
    actAs(s.adminA);
    await tente(() => updateSeats(s.orgA.id, 2));
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: s.orgA.id } })).seatCount).toBe(5);
  });
});

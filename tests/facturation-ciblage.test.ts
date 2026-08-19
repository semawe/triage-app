/**
 * L'argent — les quatre défauts que la revue adverse du 18/08/2026 a trouvés.
 *
 * `tests/facturation.test.ts` couvrait les sièges au checkout et le mur de
 * facturation vu depuis `requireOrg()`. Il ne disait rien de quatre choses :
 *
 *  1. l'organisation VISÉE par une action de facturation, alors que les écrans sont
 *     multi-organisations et rendent un sélecteur `?org=` ;
 *  2. le mur de facturation sur les actions de réunion, qui n'y était pas ;
 *  3. l'ordre et la concurrence du webhook ;
 *  4. le siège recontrôlé hors transaction à l'acceptation d'une invitation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, currentCookies, RedirectError } from "./setup";
import { addMember, makeMeeting, makeOrg, makeSpace, makeUser, prisma, resetDb } from "./factories";
import { requireBillingAdmin } from "@/lib/session";
import { requireMeetingAccess } from "@/lib/session";
import { resolveParticipant } from "@/lib/guest";
import { acceptInvite } from "@/actions/member";
import { newToken } from "@/lib/tokens";

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
  vi.clearAllMocks();
});

/** Deux organisations dont la même personne est administratrice. */
async function consultantAdminDeDeux() {
  const orgA = await makeOrg({});
  const orgB = await makeOrg({});
  const consultant = await makeUser();
  await addMember(orgA.id, consultant.id, "admin");
  await addMember(orgB.id, consultant.id, "admin");
  currentCookies.set("triage-active-org", orgA.id); // A est l'org ACTIVE
  return { orgA, orgB, consultant };
}

describe("l'organisation visée par la facturation", () => {
  it("est celle qu'on nomme, pas celle du cookie", async () => {
    const s = await consultantAdminDeDeux();
    actAs(s.consultant);
    // Le cookie dit A ; on demande B ; on doit obtenir B.
    const ctx = await requireBillingAdmin(s.orgB.id);
    expect(ctx?.org.id).toBe(s.orgB.id);
  });

  it("refuse une organisation dont on n'est pas administrateur", async () => {
    const orgC = await makeOrg({});
    const membre = await makeUser();
    await addMember(orgC.id, membre.id); // membre ordinaire
    actAs(membre);
    expect(await requireBillingAdmin(orgC.id)).toBeNull();
  });

  it("refuse une organisation dont on n'est pas membre du tout", async () => {
    const s = await consultantAdminDeDeux();
    const etranger = await makeUser();
    actAs(etranger);
    expect(await requireBillingAdmin(s.orgA.id)).toBeNull();
  });

  it("laisse passer un abonnement suspendu — c'est l'écran de régularisation", async () => {
    const s = await consultantAdminDeDeux();
    await prisma.organisation.update({
      where: { id: s.orgB.id },
      data: { subscriptionStatus: "canceled" },
    });
    actAs(s.consultant);
    expect((await requireBillingAdmin(s.orgB.id))?.org.id).toBe(s.orgB.id);
  });
});

describe("le mur de facturation couvre aussi les réunions", () => {
  async function reunionDOrgSuspendue(statut: "active" | "canceled" | "past_due") {
    const org = await makeOrg({});
    await prisma.organisation.update({
      where: { id: org.id },
      data: { subscriptionStatus: statut, trialEndsAt: null },
    });
    const membre = await makeUser();
    await addMember(org.id, membre.id);
    const espace = await makeSpace(org.id);
    const reunion = await makeMeeting(espace.id, { status: "open", createdById: membre.id });
    currentCookies.set("triage-active-org", org.id);
    return { org, membre, reunion };
  }

  it("ferme les actions de réunion quand l'abonnement est résilié", async () => {
    const s = await reunionDOrgSuspendue("canceled");
    actAs(s.membre);
    expect(await requireMeetingAccess(s.reunion.id)).toBeNull();
  });

  it("les ferme aussi en paiement en retard", async () => {
    const s = await reunionDOrgSuspendue("past_due");
    actAs(s.membre);
    expect(await requireMeetingAccess(s.reunion.id)).toBeNull();
  });

  it("ferme le flux d'événements de la même façon", async () => {
    const s = await reunionDOrgSuspendue("canceled");
    actAs(s.membre);
    expect(await resolveParticipant(s.reunion.id)).toBeNull();
  });

  it("laisse tout ouvert quand l'abonnement est actif", async () => {
    const s = await reunionDOrgSuspendue("active");
    actAs(s.membre);
    expect(await requireMeetingAccess(s.reunion.id)).not.toBeNull();
    expect(await resolveParticipant(s.reunion.id)).not.toBeNull();
  });

  it("laisse passer un super-admin de plateforme, comme le mur de requireOrg", async () => {
    const s = await reunionDOrgSuspendue("canceled");
    await prisma.superAdmin.create({ data: { userId: s.membre.id } });
    actAs(s.membre);
    expect(await requireMeetingAccess(s.reunion.id)).not.toBeNull();
  });
});

describe("siège au dernier moment — acceptInvite", () => {
  it("ne laisse pas deux invités entrer sur le dernier siège", async () => {
    const org = await makeOrg({});
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    // 2 sièges, 1 occupé : il en reste exactement un.
    await prisma.organisation.update({ where: { id: org.id }, data: { seatCount: 2 } });

    const a = await makeUser();
    const b = await makeUser();
    const jetonA = newToken();
    const jetonB = newToken();
    const dans7j = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await prisma.pendingInvite.create({
      data: { orgId: org.id, role: "member", token: jetonA, email: a.email!, expiresAt: dans7j },
    });
    await prisma.pendingInvite.create({
      data: { orgId: org.id, role: "member", token: jetonB, email: b.email!, expiresAt: dans7j },
    });

    await Promise.allSettled([
      (async () => { actAs(a); return acceptInvite(jetonA); })(),
      (async () => { actAs(b); return acceptInvite(jetonB); })(),
    ]);

    const effectif = await prisma.organisationMember.count({ where: { organisationId: org.id } });
    expect(effectif).toBeLessThanOrEqual(2);
  });

  it("laisse entrer quand il reste de la place", async () => {
    const org = await makeOrg({});
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    await prisma.organisation.update({ where: { id: org.id }, data: { seatCount: 10 } });

    const a = await makeUser();
    const jeton = newToken();
    await prisma.pendingInvite.create({
      data: {
        orgId: org.id, role: "member", token: jeton, email: a.email!,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    actAs(a);
    await acceptInvite(jeton).catch((e) => {
      if (!(e instanceof RedirectError)) throw e;
    });
    expect(await prisma.organisationMember.count({ where: { organisationId: org.id } })).toBe(2);
    // L'invitation est consommée : usage unique.
    expect(await prisma.pendingInvite.count()).toBe(0);
  });
});

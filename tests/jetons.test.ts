/**
 * Test 4 — Jetons et identité.
 *
 * Une invitation email nominative ne doit pas conférer son rôle à un autre
 * compte (elle circule par transfert, historique, capture). Et la révocation
 * d'un invité de réunion doit être définitive : réinviter la même adresse ne
 * ressuscite pas l'ancien lien.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actAs, currentCookies, RedirectError } from "./setup";
import {
  addMember, addSpaceMember, makeMeeting, makeOrg, makeSpace, makeUser, prisma, resetDb,
} from "./factories";
import { acceptInvite, sendInviteByEmail, generateInvite } from "@/actions/member";
import { enterAsGuest, inviteGuestToMeeting, revokeGuest } from "@/actions/guest";
import { newToken } from "@/lib/tokens";

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
});

async function orgWithAdmin() {
  const org = await makeOrg({});
  const admin = await makeUser("admin@example.com");
  await addMember(org.id, admin.id, "admin");
  currentCookies.set("triage-active-org", org.id);
  return { org, admin };
}

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("invitation d'organisation", () => {
  it("refuse une invitation nominative ouverte avec un autre compte", async () => {
    const { org, admin } = await orgWithAdmin();
    actAs(admin);
    await sendInviteByEmail(null, form({ email: "cible@example.com", role: "admin" }));

    const invite = await prisma.pendingInvite.findFirstOrThrow({ where: { orgId: org.id } });
    expect(invite.email).toBe("cible@example.com");

    const attaquant = await makeUser("attaquant@example.com");
    actAs(attaquant);
    await expect(acceptInvite(invite.token)).rejects.toThrow(/wrong-account/);

    const membership = await prisma.organisationMember.findUnique({
      where: { organisationId_userId: { organisationId: org.id, userId: attaquant.id } },
    });
    expect(membership).toBeNull();
  });

  it("accepte l'invitation depuis le compte destinataire", async () => {
    const { org, admin } = await orgWithAdmin();
    actAs(admin);
    await sendInviteByEmail(null, form({ email: "cible@example.com", role: "admin" }));
    const invite = await prisma.pendingInvite.findFirstOrThrow({ where: { orgId: org.id } });

    const cible = await makeUser("cible@example.com");
    actAs(cible);
    await acceptInvite(invite.token).catch((e) => {
      if (!(e instanceof RedirectError)) throw e;
    });

    const membership = await prisma.organisationMember.findUnique({
      where: { organisationId_userId: { organisationId: org.id, userId: cible.id } },
    });
    expect(membership?.role).toBe("admin");
    // Usage unique
    expect(await prisma.pendingInvite.findUnique({ where: { id: invite.id } })).toBeNull();
  });

  it("laisse le lien généré manuellement ouvert à tout compte", async () => {
    const { org, admin } = await orgWithAdmin();
    actAs(admin);
    await generateInvite(null, form({ role: "member" }));
    const invite = await prisma.pendingInvite.findFirstOrThrow({ where: { orgId: org.id } });
    expect(invite.email).toBeNull();

    const quiconque = await makeUser();
    actAs(quiconque);
    await acceptInvite(invite.token).catch((e) => {
      if (!(e instanceof RedirectError)) throw e;
    });
    const membership = await prisma.organisationMember.findUnique({
      where: { organisationId_userId: { organisationId: org.id, userId: quiconque.id } },
    });
    expect(membership).not.toBeNull();
  });
});

describe("entropie des jetons", () => {
  it("produit des jetons longs, uniques et non séquentiels", () => {
    const tokens = Array.from({ length: 200 }, () => newToken());
    expect(new Set(tokens).size).toBe(200);
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(42);
    // Deux jetons consécutifs ne partagent pas de long préfixe (contrairement à cuid()).
    const [a, b] = [newToken(), newToken()];
    let commonPrefix = 0;
    while (commonPrefix < a.length && a[commonPrefix] === b[commonPrefix]) commonPrefix++;
    expect(commonPrefix).toBeLessThan(6);
  });
});

describe("invité de réunion", () => {
  it("ne relie jamais un jeton invité au compte réel portant la même adresse", async () => {
    const org = await makeOrg({});
    const host = await makeUser("host-identity@example.com");
    const realAccount = await makeUser("invite-existing@example.com");
    await addMember(org.id, host.id, "admin");
    const space = await makeSpace(org.id);
    const meeting = await makeMeeting(space.id, { status: "open", createdById: host.id });
    currentCookies.set("triage-active-org", org.id);
    actAs(host);

    await inviteGuestToMeeting(
      meeting.id,
      null,
      form({ email: realAccount.email!, name: "Invité ponctuel" })
    );
    const guest = await prisma.meetingGuest.findFirstOrThrow({ where: { meetingId: meeting.id } });

    actAs(null);
    await enterAsGuest(guest.token, form({ name: "Invité ponctuel" })).catch((e) => {
      if (!(e instanceof RedirectError)) throw e;
    });

    const entered = await prisma.meetingGuest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(entered.userId).not.toBe(realAccount.id);
    const guestUser = await prisma.user.findUniqueOrThrow({ where: { id: entered.userId! } });
    expect(guestUser.email).toBe(`guest-${guest.id}@guest.triapp.invalid`);
  });

  it("ne ressuscite pas l'ancien jeton après révocation puis réinvitation", async () => {
    const org = await makeOrg({});
    const host = await makeUser("host@example.com");
    await addMember(org.id, host.id, "admin");
    const space = await makeSpace(org.id);
    await addSpaceMember(space.id, host.id, "lead");
    const meeting = await makeMeeting(space.id, { status: "open", createdById: host.id });
    currentCookies.set("triage-active-org", org.id);
    actAs(host);

    await inviteGuestToMeeting(meeting.id, null, form({ email: "invite@example.com" }));
    const first = await prisma.meetingGuest.findFirstOrThrow({ where: { meetingId: meeting.id } });

    await revokeGuest(meeting.id, first.id);
    expect((await prisma.meetingGuest.findUniqueOrThrow({ where: { id: first.id } })).revokedAt).not.toBeNull();

    await inviteGuestToMeeting(meeting.id, null, form({ email: "invite@example.com" }));
    const second = await prisma.meetingGuest.findUniqueOrThrow({ where: { id: first.id } });
    expect(second.revokedAt).toBeNull();
    expect(second.token).not.toBe(first.token);
  });

  it("révoque les accès invités à la clôture de la réunion", async () => {
    const org = await makeOrg({});
    const host = await makeUser("host2@example.com");
    await addMember(org.id, host.id, "admin");
    const space = await makeSpace(org.id);
    const meeting = await makeMeeting(space.id, { status: "open", createdById: host.id });
    currentCookies.set("triage-active-org", org.id);
    actAs(host);

    await inviteGuestToMeeting(meeting.id, null, form({ email: "invite@example.com" }));
    const { closeMeeting } = await import("@/actions/meeting");
    await closeMeeting(meeting.id);

    const guest = await prisma.meetingGuest.findFirstOrThrow({ where: { meetingId: meeting.id } });
    expect(guest.revokedAt).not.toBeNull();
  });
});

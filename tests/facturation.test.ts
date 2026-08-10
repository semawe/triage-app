/**
 * Test 3 — La facturation n'est pas manipulable depuis le client.
 *
 * `createCheckoutSession` ne validait pas le nombre de sièges reçu : une org de
 * 40 membres pouvait s'abonner à 1 siège. Et l'admin d'une org expirée
 * traversait le mur de facturation vers toute l'application.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, currentCookies, RedirectError } from "./setup";
import { addMember, makeOrg, makeUser, prisma, resetDb } from "./factories";
import type { SubscriptionStatus } from "@/generated/prisma";

const checkoutCreate = vi.fn(async () => ({ url: "https://stripe.test/session" }));
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    stripe: {
      customers: { create: async () => ({ id: "cus_test" }) },
      checkout: { sessions: { create: (...args: unknown[]) => checkoutCreate(...(args as [])) } },
    },
  };
});

beforeEach(async () => {
  await resetDb();
  currentCookies.clear();
  checkoutCreate.mockClear();
});

async function orgWithMembers(count: number, status: SubscriptionStatus = "active") {
  const org = await makeOrg({});
  await prisma.organisation.update({
    where: { id: org.id },
    data: { subscriptionStatus: status, seatCount: 50 },
  });
  const admin = await makeUser();
  await addMember(org.id, admin.id, "admin");
  for (let i = 1; i < count; i++) {
    const u = await makeUser();
    await addMember(org.id, u.id);
  }
  currentCookies.set("triage-active-org", org.id);
  return { org, admin };
}

describe("sièges au checkout", () => {
  it("refuse moins de sièges que de membres", async () => {
    const { admin } = await orgWithMembers(5);
    actAs(admin);
    const { createCheckoutSession } = await import("@/actions/billing");
    await createCheckoutSession(1).catch(() => {});
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("refuse zéro, un négatif, un non-entier et une valeur démesurée", async () => {
    const { admin } = await orgWithMembers(2);
    actAs(admin);
    const { createCheckoutSession } = await import("@/actions/billing");
    for (const seats of [0, -3, 2.5, 10_000]) {
      await createCheckoutSession(seats).catch(() => {});
    }
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("accepte un nombre de sièges au moins égal à l'effectif", async () => {
    const { admin } = await orgWithMembers(3);
    actAs(admin);
    const { createCheckoutSession } = await import("@/actions/billing");
    await createCheckoutSession(3).catch((e) => {
      if (!(e instanceof RedirectError)) throw e;
    });
    expect(checkoutCreate).toHaveBeenCalledOnce();
  });

  it("refuse un non-admin", async () => {
    const { org } = await orgWithMembers(2);
    const member = await makeUser();
    await addMember(org.id, member.id);
    actAs(member);
    const { createCheckoutSession } = await import("@/actions/billing");
    await createCheckoutSession(10).catch(() => {});
    expect(checkoutCreate).not.toHaveBeenCalled();
  });
});

describe("mur de facturation", () => {
  it("arrête l'admin d'une organisation résiliée", async () => {
    const { admin } = await orgWithMembers(2, "canceled");
    actAs(admin);
    const { requireOrg } = await import("@/lib/session");
    await expect(requireOrg()).rejects.toThrow(/billing-wall/);
  });

  it("arrête aussi un membre ordinaire", async () => {
    const { org } = await orgWithMembers(2, "past_due");
    const member = await makeUser();
    await addMember(org.id, member.id);
    actAs(member);
    const { requireOrg } = await import("@/lib/session");
    await expect(requireOrg()).rejects.toThrow(/billing-wall/);
  });

  it("laisse passer les écrans de régularisation", async () => {
    const { admin } = await orgWithMembers(2, "canceled");
    actAs(admin);
    const { requireOrgForBilling } = await import("@/lib/session");
    const ctx = await requireOrgForBilling();
    expect(ctx.membership.role).toBe("admin");
  });

  it("laisse passer un super-admin plateforme", async () => {
    const { admin } = await orgWithMembers(2, "canceled");
    await prisma.superAdmin.create({ data: { userId: admin.id } });
    actAs(admin);
    const { requireOrg } = await import("@/lib/session");
    const ctx = await requireOrg();
    expect(ctx.org.subscriptionStatus).toBe("canceled");
  });
});

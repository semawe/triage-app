"use server";

import { stripe, PRICE_PER_SEAT_EUR_CENTS } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Crée ou récupère le Stripe Customer pour une org */
async function ensureStripeCustomer(orgId: string): Promise<string> {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: orgId } });
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { orgId },
  });

  await prisma.organisation.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/** Lance une session Stripe Checkout pour s'abonner */
export async function createCheckoutSession(seats: number) {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return;

  const locale = await getLocale().catch(() => "fr");
  const customerId = await ensureStripeCustomer(org.id);
  const base = appUrl();

  // TVA : prix catalogue en HT. Si un TaxRate Stripe (20 %, inclusive=false) est
  // configuré via STRIPE_TAX_RATE_ID, il est appliqué en supplément → 2 € HT = 2,40 € TTC.
  // Sans cette variable, le comportement reste inchangé (montant facturé à plat).
  // Les associations passent par un code promo (allow_promotion_codes) créé à la demande.
  const taxRateId = process.env.STRIPE_TAX_RATE_ID;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          recurring: { interval: "month" },
          unit_amount: PRICE_PER_SEAT_EUR_CENTS,
          product_data: {
            name: "triapp.fr — abonnement",
            description: `${seats} siège${seats > 1 ? "s" : ""} · 2 € HT/utilisateur/mois`,
          },
        },
        quantity: seats,
        ...(taxRateId ? { tax_rates: [taxRateId] } : {}),
      },
    ],
    subscription_data: {
      metadata: { orgId: org.id },
    },
    success_url: `${base}/${locale}/settings?billing=success`,
    cancel_url: `${base}/${locale}/settings?billing=cancel`,
    locale: "fr",
    allow_promotion_codes: true,
  });

  if (session.url) redirect(session.url);
}

/** Ouvre le portail self-service Stripe (changer CB, voir factures, annuler) */
export async function createCustomerPortalSession() {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return;
  if (!org.stripeCustomerId) return;

  const locale = await getLocale().catch(() => "fr");
  const base = appUrl();

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${base}/${locale}/settings`,
  });

  redirect(session.url);
}

/** Met à jour le nombre de sièges (modifie l'abonnement Stripe) */
export async function updateSeats(seats: number) {
  const { org, membership } = await requireOrg();
  if (membership.role !== "admin") return;
  if (!org.stripeSubId) return;

  const sub = await stripe.subscriptions.retrieve(org.stripeSubId);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) return;

  await stripe.subscriptions.update(org.stripeSubId, {
    items: [{ id: itemId, quantity: seats }],
    proration_behavior: "always_invoice",
  });

  await prisma.organisation.update({
    where: { id: org.id },
    data: { seatCount: seats },
  });

  revalidatePath("/", "layout");
}

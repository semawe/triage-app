import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Organisation visée par l'événement, résolue AVANT traitement : elle sert de
 * périmètre au contrôle d'ordre (un événement d'une org n'a rien à dire sur
 * l'état d'une autre).
 */
async function resolveOrgId(event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) return null;
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      return sub.metadata.orgId ?? null;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return sub.metadata.orgId ?? null;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) return null;
      const org = await prisma.organisation.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      return org?.id ?? null;
    }
    default:
      return null;
  }
}

// Disable body parsing — Stripe needs the raw body to verify the signature
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // La signature garantit l'origine, ni l'unicité ni l'ordre : Stripe peut
  // livrer deux fois, et livrer dans le désordre. Un événement déjà appliqué
  // est ignoré ; un événement antérieur au dernier appliqué SUR LA MÊME ORG
  // n'écrase plus un état plus récent.
  const eventCreatedAt = new Date(event.created * 1000);
  const already = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (already) return NextResponse.json({ received: true, duplicate: true });

  const orgId = await resolveOrgId(event);
  const mark = () =>
    prisma.stripeEvent.create({
      data: { id: event.id, type: event.type, orgId, createdAt: eventCreatedAt },
    });

  if (!orgId) {
    await mark();
    return NextResponse.json({ received: true, ignored: true });
  }

  const lastApplied = await prisma.stripeEvent.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastApplied && eventCreatedAt < lastApplied.createdAt) {
    await mark();
    return NextResponse.json({ received: true, stale: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = session.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subId);
        const seats = sub.items.data[0]?.quantity ?? 1;

        // Filet côté serveur : un abonnement souscrit pour moins de sièges que
        // de membres est signalé plutôt qu'enregistré en silence.
        const memberCount = await prisma.organisationMember.count({
          where: { organisationId: orgId },
        });
        if (seats < memberCount) {
          console.error(
            `[stripe-webhook] org ${orgId} : ${seats} siège(s) souscrit(s) pour ${memberCount} membre(s)`
          );
        }

        await prisma.organisation.update({
          where: { id: orgId },
          data: {
            stripeSubId: subId,
            subscriptionStatus: "active",
            seatCount: seats,
            trialEndsAt: null,
          },
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        // L'événement doit porter sur l'abonnement courant de l'org : un
        // abonnement abandonné ne pilote plus l'accès.
        const org = await prisma.organisation.findUnique({
          where: { id: orgId },
          select: { stripeSubId: true },
        });
        if (org?.stripeSubId && org.stripeSubId !== sub.id) break;

        // Tout état hors « actif » ferme l'accès : `unpaid`, `incomplete`,
        // `incomplete_expired`, `paused` laissaient auparavant l'org en `active`.
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? "active"
            : sub.status === "past_due"
              ? "past_due"
              : "canceled";

        const seats = sub.items.data[0]?.quantity ?? 1;

        await prisma.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: status, seatCount: seats },
        });
        break;
      }

      case "customer.subscription.deleted": {
        await prisma.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: "canceled", stripeSubId: null },
        });
        break;
      }

      case "invoice.payment_failed": {
        await prisma.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: "past_due" },
        });
        break;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook]", err);
    // Pas de marquage : Stripe rejouera l'événement.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  await mark();

  return NextResponse.json({ received: true });
}

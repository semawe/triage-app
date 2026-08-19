import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";
import type { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";

/**
 * L'abonnement que l'événement concerne, quand il en désigne un. Sert à écarter
 * un événement portant sur un abonnement abandonné : sans ce contrôle, la
 * suppression tardive d'un ancien abonnement résiliait le nouveau.
 */
function subIdDeLEvenement(event: Stripe.Event): string | null {
  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return (event.data.object as Stripe.Subscription).id;
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
      if (!sub) return null;
      return typeof sub === "string" ? sub : sub.id;
    }
    default:
      return null;
  }
}

/**
 * Organisation visée par l'événement, résolue AVANT traitement : elle sert de
 * périmètre au contrôle d'ordre (un événement d'une org n'a rien à dire sur
 * l'état d'une autre).
 */
async function resolveOrgId(
  event: Stripe.Event,
  /** Abonnement du checkout, déjà récupéré une fois pour toutes par l'appelant. */
  abonnementDuCheckout: Stripe.Subscription | null
): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed":
      return abonnementDuCheckout?.metadata.orgId ?? null;
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

  // L'appel à Stripe se fait AVANT d'ouvrir la transaction, et une seule fois :
  // tenir le verrou de la ligne organisation pendant un aller-retour HTTP
  // l'exposerait aux délais du réseau, et sérialiserait les livraisons d'une
  // organisation derrière la latence de l'API. Le même abonnement sert à résoudre
  // l'organisation puis à appliquer l'effet.
  let abonnementDuCheckout: Stripe.Subscription | null = null;
  if (event.type === "checkout.session.completed") {
    const sessionStripe = event.data.object as Stripe.Checkout.Session;
    if (sessionStripe.mode === "subscription" && sessionStripe.subscription) {
      abonnementDuCheckout = await stripe.subscriptions.retrieve(
        sessionStripe.subscription as string
      );
    }
  }

  const orgId = await resolveOrgId(event, abonnementDuCheckout);

  if (!orgId) {
    // Rien à appliquer : on note l'événement pour ne pas le retraiter.
    await prisma.stripeEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, type: event.type, orgId: null, createdAt: eventCreatedAt },
      update: {},
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  // Tout ce qui suit — contrôle de doublon, contrôle d'ordre, application et
  // marquage — vit dans UNE transaction, sous verrou de la ligne organisation.
  //
  // Séparés, ces quatre gestes laissaient passer le cas concurrent : deux
  // livraisons simultanées lisaient le même `lastApplied`, toutes deux se
  // jugeaient récentes, et la plus ancienne écrasait la plus récente en
  // terminant après elle. L'idempotence tenait pour une redélivrance séquentielle,
  // pas pour deux en parallèle (revue adverse du 18/08/2026). Le verrou sérialise
  // les événements d'une même organisation, et n'a aucun effet sur les autres.
  try {
    const issue = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId} FOR UPDATE`;

      const already = await tx.stripeEvent.findUnique({ where: { id: event.id } });
      if (already) return "duplicate" as const;

      const lastApplied = await tx.stripeEvent.findFirst({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastApplied && eventCreatedAt < lastApplied.createdAt) {
        await tx.stripeEvent.create({
          data: { id: event.id, type: event.type, orgId, createdAt: eventCreatedAt },
        });
        return "stale" as const;
      }

      // L'événement doit porter sur l'abonnement courant de l'organisation. Seul
      // `subscription.updated` le vérifiait ; `deleted` et `payment_failed` non,
      // si bien que la fin d'un abonnement abandonné fermait l'accès payé par le
      // nouveau.
      const subIdEvenement = subIdDeLEvenement(event);
      if (subIdEvenement) {
        const org = await tx.organisation.findUnique({
          where: { id: orgId },
          select: { stripeSubId: true },
        });
        if (org?.stripeSubId && org.stripeSubId !== subIdEvenement) {
          await tx.stripeEvent.create({
            data: { id: event.id, type: event.type, orgId, createdAt: eventCreatedAt },
          });
          return "autre-abonnement" as const;
        }
      }

      await appliquer(tx, event, orgId, abonnementDuCheckout);

      await tx.stripeEvent.create({
        data: { id: event.id, type: event.type, orgId, createdAt: eventCreatedAt },
      });
      return null;
    });

    if (issue) return NextResponse.json({ received: true, [issue]: true });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    // Pas de marquage : la transaction a été annulée, Stripe rejouera l'événement.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Applique l'effet métier de l'événement. Toujours appelé dans la transaction. */
async function appliquer(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  orgId: string,
  abonnementDuCheckout: Stripe.Subscription | null
): Promise<void> {
  {
    switch (event.type) {
      case "checkout.session.completed": {
        const sub = abonnementDuCheckout;
        if (!sub) break; // pas un abonnement : rien à appliquer
        const subId = sub.id;
        const seats = sub.items.data[0]?.quantity ?? 1;

        // Filet côté serveur : un abonnement souscrit pour moins de sièges que
        // de membres est signalé plutôt qu'enregistré en silence.
        const memberCount = await tx.organisationMember.count({
          where: { organisationId: orgId },
        });
        if (seats < memberCount) {
          console.error(
            `[stripe-webhook] org ${orgId} : ${seats} siège(s) souscrit(s) pour ${memberCount} membre(s)`
          );
        }

        await tx.organisation.update({
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

        // Tout état hors « actif » ferme l'accès : `unpaid`, `incomplete`,
        // `incomplete_expired`, `paused` laissaient auparavant l'org en `active`.
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? "active"
            : sub.status === "past_due"
              ? "past_due"
              : "canceled";

        const seats = sub.items.data[0]?.quantity ?? 1;

        await tx.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: status, seatCount: seats },
        });
        break;
      }

      case "customer.subscription.deleted": {
        await tx.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: "canceled", stripeSubId: null },
        });
        break;
      }

      case "invoice.payment_failed": {
        await tx.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: "past_due" },
        });
        break;
      }
    }
  }
}

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

export const runtime = "nodejs";

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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const orgId = session.subscription
          ? (await stripe.subscriptions.retrieve(session.subscription as string)).metadata.orgId
          : null;
        if (!orgId) break;

        const subId = session.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subId);
        const seats = sub.items.data[0]?.quantity ?? 1;

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
        const orgId = sub.metadata.orgId;
        if (!orgId) break;

        const status =
          sub.status === "active" ? "active"
          : sub.status === "past_due" ? "past_due"
          : sub.status === "canceled" ? "canceled"
          : null;

        if (!status) break;

        const seats = sub.items.data[0]?.quantity ?? 1;

        await prisma.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: status, seatCount: seats },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata.orgId;
        if (!orgId) break;

        await prisma.organisation.update({
          where: { id: orgId },
          data: { subscriptionStatus: "canceled", stripeSubId: null },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        if (!customerId) break;

        const org = await prisma.organisation.findFirst({ where: { stripeCustomerId: customerId } });
        if (!org) break;

        await prisma.organisation.update({
          where: { id: org.id },
          data: { subscriptionStatus: "past_due" },
        });
        break;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook]", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

import Stripe from "stripe";

// Lazy singleton — only initialised when a real Stripe call is made.
// Without STRIPE_SECRET_KEY the app boots fine; billing actions throw at call time.
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

let _stripe: Stripe | null = null;
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) _stripe = getStripe();
    return (_stripe as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const PRICE_PER_SEAT_EUR_CENTS = 200; // 2,00 €
export const TRIAL_DAYS = 14;

/** Vérifie si une organisation a accès (trial valide, active, ou admin override) */
export function isOrgAccessible(org: {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}): boolean {
  if (org.subscriptionStatus === "active") return true;
  if (org.subscriptionStatus === "trial") {
    if (!org.trialEndsAt) return true; // trial sans date = illimité (dev)
    return new Date() < new Date(org.trialEndsAt);
  }
  return false;
}

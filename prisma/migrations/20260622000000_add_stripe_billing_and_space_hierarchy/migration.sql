-- Stripe billing fields on Organisation
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'past_due', 'canceled');

ALTER TABLE "Organisation"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
  ADD COLUMN "stripeSubId" TEXT,
  ADD COLUMN "seatCount" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Organisation_stripeCustomerId_key" ON "Organisation"("stripeCustomerId");
CREATE UNIQUE INDEX "Organisation_stripeSubId_key" ON "Organisation"("stripeSubId");

-- Space hierarchy + purpose/accountabilities/domains
ALTER TABLE "Space"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "accountabilities" TEXT,
  ADD COLUMN "domains" TEXT;

ALTER TABLE "Space"
  ADD CONSTRAINT "Space_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Role purpose/accountabilities/domains
ALTER TABLE "Role"
  ADD COLUMN "accountabilities" TEXT,
  ADD COLUMN "domains" TEXT;

-- RoleAssignment unique constraint
CREATE UNIQUE INDEX "RoleAssignment_roleId_userId_key" ON "RoleAssignment"("roleId", "userId");

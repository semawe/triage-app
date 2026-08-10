-- AlterTable
ALTER TABLE "PendingInvite" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StripeEvent_orgId_createdAt_idx" ON "StripeEvent"("orgId", "createdAt");

-- Un seul point actif par réunion : dernier filet côté base contre les
-- transitions d'agenda concurrentes (deux facilitateurs cliquant ensemble).
-- Normalisation préalable des données existantes : on garde le point actif
-- d'ordre le plus faible, les autres repassent en attente.
UPDATE "AgendaItem" a
SET status = 'pending'
WHERE a.status = 'active'
  AND a.id <> (
    SELECT b.id FROM "AgendaItem" b
    WHERE b."meetingId" = a."meetingId" AND b.status = 'active'
    ORDER BY b."order" ASC, b.id ASC
    LIMIT 1
  );

CREATE UNIQUE INDEX "agenda_one_active_per_meeting"
ON "AgendaItem" ("meetingId")
WHERE status = 'active';

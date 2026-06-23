-- AddColumn allowedEmailDomain on Organisation
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "allowedEmailDomain" TEXT;

-- CreateEnum JoinRequestStatus
DO $$ BEGIN
  CREATE TYPE "JoinRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable JoinRequest
CREATE TABLE IF NOT EXISTS "JoinRequest" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "status"         "JoinRequestStatus" NOT NULL DEFAULT 'pending',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex (userId, organisationId)
CREATE UNIQUE INDEX IF NOT EXISTS "JoinRequest_userId_organisationId_key"
  ON "JoinRequest"("userId", "organisationId");

-- ForeignKeys (DROP+ADD pattern for idempotency)
ALTER TABLE "JoinRequest"
  DROP CONSTRAINT IF EXISTS "JoinRequest_userId_fkey";
ALTER TABLE "JoinRequest"
  ADD CONSTRAINT "JoinRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JoinRequest"
  DROP CONSTRAINT IF EXISTS "JoinRequest_organisationId_fkey";
ALTER TABLE "JoinRequest"
  ADD CONSTRAINT "JoinRequest_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

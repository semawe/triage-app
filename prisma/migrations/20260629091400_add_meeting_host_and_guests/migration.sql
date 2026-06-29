-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "createdById" TEXT;

-- CreateTable
CREATE TABLE "MeetingGuest" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingGuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingGuest_token_key" ON "MeetingGuest"("token");

-- CreateIndex
CREATE INDEX "MeetingGuest_meetingId_idx" ON "MeetingGuest"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingGuest_meetingId_email_key" ON "MeetingGuest"("meetingId", "email");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingGuest" ADD CONSTRAINT "MeetingGuest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingGuest" ADD CONSTRAINT "MeetingGuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

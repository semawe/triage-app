-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "scribeId" TEXT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_scribeId_fkey" FOREIGN KEY ("scribeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

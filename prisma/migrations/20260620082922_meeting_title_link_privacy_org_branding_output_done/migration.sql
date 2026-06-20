-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "isPrivate" BOOLEAN,
ADD COLUMN     "link" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "primaryColor" TEXT;

-- AlterTable
ALTER TABLE "Output" ADD COLUMN     "isDone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

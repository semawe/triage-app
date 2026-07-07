-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "strategy" TEXT;

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Policy_spaceId_idx" ON "Policy"("spaceId");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

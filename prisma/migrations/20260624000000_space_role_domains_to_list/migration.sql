-- Convert Space/Role `domains` and `accountabilities` from scalar TEXT to TEXT[] (Prisma String[]).
-- Reconciles the migration history with a state previously applied via `db push`.

-- AlterTable
ALTER TABLE "Space" DROP COLUMN "domains",
DROP COLUMN "accountabilities",
ADD COLUMN "domains" TEXT[],
ADD COLUMN "accountabilities" TEXT[];

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "domains",
DROP COLUMN "accountabilities",
ADD COLUMN "domains" TEXT[],
ADD COLUMN "accountabilities" TEXT[];

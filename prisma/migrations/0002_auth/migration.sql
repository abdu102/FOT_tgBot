-- AlterTable: add auth columns
ALTER TABLE "User"
  ADD COLUMN "username" TEXT UNIQUE,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;



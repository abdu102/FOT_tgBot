-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('FIVE_V_FIVE', 'SIX_V_SIX');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "type" "MatchType" NOT NULL DEFAULT 'FIVE_V_FIVE';



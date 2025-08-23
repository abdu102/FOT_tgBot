-- AlterTable Session
ALTER TABLE "Session" ADD COLUMN "winnerTeamId" TEXT;
ALTER TABLE "Session" ADD COLUMN "manOfTheSessionUserId" TEXT;

-- Foreign Keys
ALTER TABLE "Session" ADD CONSTRAINT "Session_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_manOfTheSessionUserId_fkey" FOREIGN KEY ("manOfTheSessionUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



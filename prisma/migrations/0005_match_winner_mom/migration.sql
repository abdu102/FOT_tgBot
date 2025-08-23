-- AlterTable
ALTER TABLE "Match" ADD COLUMN "winnerTeamId" TEXT;
ALTER TABLE "Match" ADD COLUMN "manOfTheMatchUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_manOfTheMatchUserId_fkey" FOREIGN KEY ("manOfTheMatchUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('HOME', 'AWAY', 'DRAW');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'STARTED', 'FINISHED');

-- AlterTable Match
ALTER TABLE "Match" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "Match" ADD COLUMN "homeTeamId" TEXT;
ALTER TABLE "Match" ADD COLUMN "awayTeamId" TEXT;
ALTER TABLE "Match" ADD COLUMN "homeScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN "awayScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN "result" "MatchResult";

-- CreateTable Session
CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "startAt" TIMESTAMP NOT NULL,
  "endAt" TIMESTAMP NOT NULL,
  "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL
);

-- CreateTable SessionTeam
CREATE TABLE "SessionTeam" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "goalsFor" INTEGER NOT NULL DEFAULT 0,
  "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SessionTeam_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SessionTeam_sessionId_teamId_key" ON "SessionTeam" ("sessionId","teamId");

-- Foreign Keys
ALTER TABLE "Match" ADD CONSTRAINT "Match_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

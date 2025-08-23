-- CreateTable SessionRegistration
CREATE TABLE "SessionRegistration" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "teamId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "groupIndex" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP,
  CONSTRAINT "SessionRegistration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SessionRegistration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Alter Payment to reference SessionRegistration
ALTER TABLE "Payment" ADD COLUMN "sessionRegistrationId" TEXT UNIQUE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sessionRegistrationId_fkey" FOREIGN KEY ("sessionRegistrationId") REFERENCES "SessionRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;



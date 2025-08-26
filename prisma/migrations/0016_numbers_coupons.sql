ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredNumber" INTEGER;
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "number" INTEGER;

CREATE TABLE IF NOT EXISTS "Coupon" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "issuedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP,
  "sessionRegistrationId" TEXT,
  CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Coupon_sessionRegistrationId_fkey" FOREIGN KEY ("sessionRegistrationId") REFERENCES "SessionRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coupon_user ON "Coupon"("userId");
CREATE INDEX IF NOT EXISTS idx_coupon_status ON "Coupon"("status");


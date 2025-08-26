-- Create enums and columns needed for player numbers and coupons

DO $$ BEGIN
  CREATE TYPE "public"."CouponStatus" AS ENUM ('AVAILABLE','USED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add number columns if missing
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredNumber" INTEGER;
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "number" INTEGER;

-- Create Coupon table if not exists
CREATE TABLE IF NOT EXISTS "Coupon" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "status" "public"."CouponStatus" NOT NULL DEFAULT 'AVAILABLE',
  "issuedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP,
  "sessionRegistrationId" TEXT,
  CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Coupon_sessionRegistrationId_fkey" FOREIGN KEY ("sessionRegistrationId") REFERENCES "SessionRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coupon_user ON "Coupon"("userId");
CREATE INDEX IF NOT EXISTS idx_coupon_status ON "Coupon"("status");



-- Create enums for registrations and payments and align column types

-- RegistrationType
DO $$ BEGIN
  CREATE TYPE "RegistrationType" AS ENUM ('INDIVIDUAL', 'TEAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RegistrationStatus
DO $$ BEGIN
  CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- PaymentStatus (if not already enum)
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Alter Registration to use enums
ALTER TABLE "Registration"
  ALTER COLUMN "type" TYPE "RegistrationType" USING "type"::text::"RegistrationType",
  ALTER COLUMN "status" TYPE "RegistrationStatus" USING "status"::text::"RegistrationStatus";

-- Alter SessionRegistration to use enums
ALTER TABLE "SessionRegistration"
  ALTER COLUMN "type" TYPE "RegistrationType" USING "type"::text::"RegistrationType",
  ALTER COLUMN "status" TYPE "RegistrationStatus" USING "status"::text::"RegistrationStatus";

-- Alter Payment to use enum
ALTER TABLE "Payment"
  ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::text::"PaymentStatus";



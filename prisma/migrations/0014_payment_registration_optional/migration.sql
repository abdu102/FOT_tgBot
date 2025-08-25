-- Make Payment.registrationId optional to allow payments linked only to SessionRegistration
ALTER TABLE "Payment" ALTER COLUMN "registrationId" DROP NOT NULL;



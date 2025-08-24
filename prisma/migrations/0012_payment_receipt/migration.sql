-- Alter Payment to store Telegram file_id for receipt
ALTER TABLE "Payment" ADD COLUMN "receiptFileId" TEXT;



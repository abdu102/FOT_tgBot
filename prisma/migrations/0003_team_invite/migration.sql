-- Add missing columns for Team invites and description
ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteToken" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteExpiresAt" TIMESTAMP;

-- Create unique index for inviteToken if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Team_inviteToken_key'
  ) THEN
    CREATE UNIQUE INDEX "Team_inviteToken_key" ON "Team" ("inviteToken");
  END IF;
END$$;



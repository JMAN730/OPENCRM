-- Add a Svix message id to EmailEvent so the Resend webhook can deduplicate
-- at-least-once retries. Idempotent so it is safe to re-apply.
ALTER TABLE IF EXISTS "EmailEvent" ADD COLUMN IF NOT EXISTS "svixId" TEXT;

-- Postgres unique indexes permit multiple NULLs, so events recorded outside
-- the webhook path (svixId IS NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "EmailEvent_svixId_key" ON "EmailEvent"("svixId");

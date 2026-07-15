-- SMS-first outreach on top of the one-off SMS foundation (20260713060000):
-- link outreach jobs to their generated SMS drafts and drop the organization
-- denormalization from SmsEvent — events are draft-scoped, and the draft
-- already carries the organization.
-- (The SmsDraftStatus enum keeps the now-unused SENDING value: Postgres enum
-- values cannot be dropped in place.)

ALTER TABLE "OutreachJob" ADD COLUMN "smsDraftId" TEXT;

ALTER TABLE "SmsEvent" DROP COLUMN "organizationId";

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SMS_DRAFT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SMS_SENT';

CREATE TYPE "SmsDraftStatus" AS ENUM ('DRAFT', 'SENT', 'DELIVERED', 'FAILED');

CREATE TABLE "SmsDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "websiteId" TEXT,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "twilioMessageSid" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmsDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsEvent" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "dedupKey" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoneOptOut" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhoneOptOut_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OutreachJob" ADD COLUMN "smsDraftId" TEXT;

CREATE UNIQUE INDEX "SmsDraft_twilioMessageSid_key" ON "SmsDraft"("twilioMessageSid");
CREATE INDEX "SmsDraft_leadId_idx" ON "SmsDraft"("leadId");
CREATE INDEX "SmsDraft_organizationId_createdAt_idx" ON "SmsDraft"("organizationId", "createdAt");
CREATE INDEX "SmsDraft_organizationId_status_idx" ON "SmsDraft"("organizationId", "status");
CREATE INDEX "SmsDraft_toPhone_idx" ON "SmsDraft"("toPhone");
CREATE UNIQUE INDEX "SmsEvent_dedupKey_key" ON "SmsEvent"("dedupKey");
CREATE INDEX "SmsEvent_draftId_createdAt_idx" ON "SmsEvent"("draftId", "createdAt");
CREATE UNIQUE INDEX "PhoneOptOut_phone_organizationId_key" ON "PhoneOptOut"("phone", "organizationId");
CREATE INDEX "PhoneOptOut_organizationId_idx" ON "PhoneOptOut"("organizationId");

ALTER TABLE "SmsDraft" ADD CONSTRAINT "SmsDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsDraft" ADD CONSTRAINT "SmsDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsDraft" ADD CONSTRAINT "SmsDraft_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "GeneratedWebsite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsEvent" ADD CONSTRAINT "SmsEvent_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SmsDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoneOptOut" ADD CONSTRAINT "PhoneOptOut_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

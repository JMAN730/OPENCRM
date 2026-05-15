ALTER TABLE "Lead" ADD COLUMN "state" TEXT;

CREATE INDEX "Lead_organizationId_state_city_idx" ON "Lead"("organizationId", "state", "city");

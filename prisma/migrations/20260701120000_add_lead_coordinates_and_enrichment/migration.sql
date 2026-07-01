-- Lead map: store coordinates on leads so they can be plotted on the /map
-- viewport, and track enrichment runs as a new ScraperJob type. Idempotent so
-- it is safe to re-apply.
ALTER TABLE IF EXISTS "Lead" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE IF EXISTS "Lead" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- Map viewport queries (leads inside a lat/lng bounding box).
CREATE INDEX IF NOT EXISTS "Lead_organizationId_latitude_longitude_idx" ON "Lead"("organizationId", "latitude", "longitude");

-- "SCRAPE" (location/category scrape) or "ENRICH" (map-selected lead enrichment).
ALTER TABLE IF EXISTS "ScraperJob" ADD COLUMN IF NOT EXISTS "jobType" TEXT NOT NULL DEFAULT 'SCRAPE';

-- Activity type for contact-detail enrichment runs. Kept last: ADD VALUE takes
-- effect at commit and must not be used earlier in this transaction.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LEAD_ENRICHED';

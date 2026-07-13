-- Add Lead.category (business niche; picks the demo Template Pack).
ALTER TABLE "Lead" ADD COLUMN "category" TEXT;

-- Backfill from scraper-imported leads whose source is "GoogleMaps / Category[ / Location]".
UPDATE "Lead"
SET "category" = NULLIF(TRIM(SPLIT_PART("source", ' / ', 2)), '')
WHERE "source" LIKE 'GoogleMaps / %'
  AND "category" IS NULL;

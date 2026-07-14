-- Add Lead.category (business niche; picks the demo Template Pack).
ALTER TABLE "Lead" ADD COLUMN "category" TEXT;

-- Backfill from scraper-imported leads. The legacy source format was
-- "GoogleMaps / Category / Location", but Category and Location were each
-- optional, so a two-part source ("GoogleMaps / X") is ambiguous — X may be a
-- location rather than a category. Backfill only unambiguous rows: three-part
-- sources (the second part is always the category) and two-part sources whose
-- second part matches a known scraper category. Ambiguous rows stay NULL.
UPDATE "Lead"
SET "category" = NULLIF(TRIM(SPLIT_PART("source", ' / ', 2)), '')
WHERE "category" IS NULL
  AND (
    "source" LIKE 'GoogleMaps / % / %'
    OR (
      "source" LIKE 'GoogleMaps / %'
      AND TRIM(SPLIT_PART("source", ' / ', 2)) IN (
        'Mobile Mechanics',
        'Power washing Business',
        'Landscaping',
        'Tree Removal',
        'Cleaning',
        'Concrete',
        'Fencing Companies'
      )
    )
  );

ALTER TABLE IF EXISTS "Lead" ADD COLUMN IF NOT EXISTS "qualificationSummary" TEXT;

DO $$
BEGIN
  IF to_regtype('"ActivityType"') IS NOT NULL THEN
    ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LEAD_QUALIFIED';
  END IF;
END $$;

ALTER TABLE IF EXISTS "LeadTag" ADD COLUMN IF NOT EXISTS "tagKey" TEXT;

DO $$
BEGIN
  IF to_regclass('public."LeadTag"') IS NOT NULL THEN
    UPDATE "LeadTag"
    SET "tagKey" = lower(trim("name"))
    WHERE "tagKey" IS NULL OR "tagKey" = '';

    IF to_regclass('public."_LeadToLeadTag"') IS NOT NULL THEN
      WITH duplicate_tags AS (
        SELECT
          id AS drop_id,
          first_value(id) OVER (
            PARTITION BY "organizationId", lower(trim("name"))
            ORDER BY id
          ) AS keep_id
        FROM "LeadTag"
      ),
      tags_to_merge AS (
        SELECT drop_id, keep_id
        FROM duplicate_tags
        WHERE drop_id <> keep_id
      )
      INSERT INTO "_LeadToLeadTag" ("A", "B")
      SELECT join_rows."A", tags_to_merge.keep_id
      FROM "_LeadToLeadTag" join_rows
      JOIN tags_to_merge ON tags_to_merge.drop_id = join_rows."B"
      ON CONFLICT DO NOTHING;

      WITH duplicate_tags AS (
        SELECT
          id AS drop_id,
          first_value(id) OVER (
            PARTITION BY "organizationId", lower(trim("name"))
            ORDER BY id
          ) AS keep_id
        FROM "LeadTag"
      ),
      tags_to_merge AS (
        SELECT drop_id
        FROM duplicate_tags
        WHERE drop_id <> keep_id
      )
      DELETE FROM "_LeadToLeadTag" join_rows
      USING tags_to_merge
      WHERE join_rows."B" = tags_to_merge.drop_id;
    END IF;

    WITH duplicate_tags AS (
      SELECT
        id AS drop_id,
        first_value(id) OVER (
          PARTITION BY "organizationId", lower(trim("name"))
          ORDER BY id
        ) AS keep_id
      FROM "LeadTag"
    ),
    tags_to_delete AS (
      SELECT drop_id
      FROM duplicate_tags
      WHERE drop_id <> keep_id
    )
    DELETE FROM "LeadTag"
    USING tags_to_delete
    WHERE "LeadTag".id = tags_to_delete.drop_id;

    ALTER TABLE "LeadTag" ALTER COLUMN "tagKey" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "LeadTag_organizationId_tagKey_key"
      ON "LeadTag"("organizationId", "tagKey");
  END IF;
END $$;

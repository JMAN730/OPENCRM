-- Structured call outcome on Activity: source of all "Calls" metrics
-- (see docs/adr/0002-call-metrics-from-activity-touches.md).
ALTER TABLE "Activity" ADD COLUMN "outcome" "CallOutcome";

-- Backfill existing CALL_OUTCOME rows from their fixed-template description
-- ("Marked call outcome as <outcome, lowercased, underscores as spaces>"),
-- the only writer of this activity type.
UPDATE "Activity" SET "outcome" = CASE "description"
  WHEN 'Marked call outcome as not contacted' THEN 'NOT_CONTACTED'::"CallOutcome"
  WHEN 'Marked call outcome as answered'      THEN 'ANSWERED'::"CallOutcome"
  WHEN 'Marked call outcome as hung up'       THEN 'HUNG_UP'::"CallOutcome"
  WHEN 'Marked call outcome as no answer'     THEN 'NO_ANSWER'::"CallOutcome"
  WHEN 'Marked call outcome as ai voicemail'  THEN 'AI_VOICEMAIL'::"CallOutcome"
  WHEN 'Marked call outcome as custom'        THEN 'CUSTOM'::"CallOutcome"
END
WHERE "type" = 'CALL_OUTCOME';

-- Backfill the denormalized organizationId for rows written before it existed
-- ("Nullable for now" in the schema) so org-scoped call metrics see them.
UPDATE "Activity" a SET "organizationId" = l."organizationId"
FROM "Lead" l
WHERE a."leadId" = l.id AND a."organizationId" IS NULL;

-- Touch aggregations filter by (org, type, createdAt).
CREATE INDEX CONCURRENTLY "Activity_organizationId_type_createdAt_idx"
  ON "Activity"("organizationId", "type", "createdAt");

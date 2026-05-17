ALTER TABLE "ScraperJob"
  ALTER COLUMN "locations" DROP DEFAULT,
  ALTER COLUMN "locations" TYPE JSONB USING COALESCE(NULLIF("locations", ''), '[]')::jsonb,
  ALTER COLUMN "locations" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "categories" DROP DEFAULT,
  ALTER COLUMN "categories" TYPE JSONB USING COALESCE(NULLIF("categories", ''), '[]')::jsonb,
  ALTER COLUMN "categories" SET DEFAULT '[]'::jsonb,
  ADD COLUMN "totalQueries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completedQueries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedQueries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "workerPid" INTEGER,
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "stopRequestedAt" TIMESTAMP(3);

CREATE TABLE "ScraperImportedRow" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "leadId" TEXT,
  "organizationId" TEXT NOT NULL,
  "importedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScraperImportedRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScraperImportedRow_jobId_fingerprint_key"
  ON "ScraperImportedRow"("jobId", "fingerprint");

CREATE INDEX "ScraperImportedRow_organizationId_createdAt_idx"
  ON "ScraperImportedRow"("organizationId", "createdAt");

CREATE INDEX "ScraperImportedRow_sourceUrl_idx"
  ON "ScraperImportedRow"("sourceUrl");

CREATE INDEX "ScraperJob_status_lastHeartbeatAt_idx"
  ON "ScraperJob"("status", "lastHeartbeatAt");

CREATE INDEX "ScraperJob_workerId_idx"
  ON "ScraperJob"("workerId");

ALTER TABLE "ScraperImportedRow"
  ADD CONSTRAINT "ScraperImportedRow_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ScraperJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ScraperImportedRow_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ScraperImportedRow_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

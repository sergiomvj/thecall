CREATE TABLE IF NOT EXISTS "Persona" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "background" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "psychology" TEXT NOT NULL,
  "behavior" TEXT NOT NULL,
  "competenciesJson" TEXT NOT NULL,
  "sourcePrompt" TEXT NOT NULL,
  "normalizedFingerprint" TEXT NOT NULL,
  "similarityScoreMax" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "avatarPrompt" TEXT,
  "generationModel" TEXT,
  "avatarModel" TEXT,
  "rejectionReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PersonaSimilarity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourcePersonaId" TEXT NOT NULL,
  "comparedPersonaId" TEXT NOT NULL,
  "score" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "blockingThreshold" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaSimilarity_sourcePersonaId_fkey"
    FOREIGN KEY ("sourcePersonaId") REFERENCES "Persona" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonaSimilarity_comparedPersonaId_fkey"
    FOREIGN KEY ("comparedPersonaId") REFERENCES "Persona" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "GenerationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personaId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptHash" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "responseExcerpt" TEXT,
  "errorMessage" TEXT,
  "latencyMs" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationLog_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "Persona" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Persona_createdAt_idx" ON "Persona"("createdAt");
CREATE INDEX IF NOT EXISTS "Persona_normalizedFingerprint_idx" ON "Persona"("normalizedFingerprint");
CREATE INDEX IF NOT EXISTS "Persona_status_idx" ON "Persona"("status");
CREATE INDEX IF NOT EXISTS "PersonaSimilarity_sourcePersonaId_idx" ON "PersonaSimilarity"("sourcePersonaId");
CREATE INDEX IF NOT EXISTS "PersonaSimilarity_comparedPersonaId_idx" ON "PersonaSimilarity"("comparedPersonaId");
CREATE INDEX IF NOT EXISTS "GenerationLog_personaId_createdAt_idx" ON "GenerationLog"("personaId", "createdAt");

-- AlterTable
ALTER TABLE "SeedExample" ADD COLUMN "jangmunGroupId" TEXT;
ALTER TABLE "SeedExample" ADD COLUMN "jangmunSubType" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Passage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startIndex" INTEGER NOT NULL,
    "endIndex" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isJangmunCandidate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Passage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Passage" ("createdAt", "endIndex", "id", "sourceId", "startIndex", "status", "text", "wordCount") SELECT "createdAt", "endIndex", "id", "sourceId", "startIndex", "status", "text", "wordCount" FROM "Passage";
DROP TABLE "Passage";
ALTER TABLE "new_Passage" RENAME TO "Passage";
CREATE INDEX "Passage_status_idx" ON "Passage"("status");
CREATE INDEX "Passage_sourceId_idx" ON "Passage"("sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SeedExample_jangmunGroupId_idx" ON "SeedExample"("jangmunGroupId");

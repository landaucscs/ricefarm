-- CreateTable
CREATE TABLE "SeedExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionCode" INTEGER NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL,
    "passage" TEXT NOT NULL,
    "passageOnly" TEXT,
    "choices" TEXT,
    "wordCount" INTEGER NOT NULL,
    "answer" INTEGER NOT NULL,
    "isJangmun" BOOLEAN NOT NULL DEFAULT false,
    "jangmunNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "fullText" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Passage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startIndex" INTEGER NOT NULL,
    "endIndex" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Passage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PassageScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageId" TEXT NOT NULL,
    "scorer" TEXT NOT NULL,
    "topicDepth" INTEGER NOT NULL,
    "logicalStructure" INTEGER NOT NULL,
    "standaloneCoherence" INTEGER NOT NULL,
    "vocabularyLevel" INTEGER NOT NULL,
    "questionTypeFit" INTEGER NOT NULL,
    "distractorPotential" INTEGER NOT NULL,
    "totalWeighted" REAL NOT NULL,
    "questionTypes" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PassageScore_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PassageFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "aiScores" TEXT,
    "userScores" TEXT,
    "questionTypes" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PassageFeedback_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageId" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "passageModified" TEXT NOT NULL,
    "choices" TEXT NOT NULL,
    "correctAnswer" INTEGER NOT NULL,
    "distractorRationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedQuestion_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "corrections" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionFeedback_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "GeneratedQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "templateId" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExplanationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "example" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedExample_questionCode_key" ON "SeedExample"("questionCode");

-- CreateIndex
CREATE INDEX "SeedExample_questionType_idx" ON "SeedExample"("questionType");

-- CreateIndex
CREATE INDEX "Passage_status_idx" ON "Passage"("status");

-- CreateIndex
CREATE INDEX "Passage_sourceId_idx" ON "Passage"("sourceId");

-- CreateIndex
CREATE INDEX "PassageScore_passageId_idx" ON "PassageScore"("passageId");

-- CreateIndex
CREATE INDEX "PassageFeedback_passageId_idx" ON "PassageFeedback"("passageId");

-- CreateIndex
CREATE INDEX "GeneratedQuestion_passageId_idx" ON "GeneratedQuestion"("passageId");

-- CreateIndex
CREATE INDEX "GeneratedQuestion_questionType_idx" ON "GeneratedQuestion"("questionType");

-- CreateIndex
CREATE INDEX "QuestionFeedback_questionId_idx" ON "QuestionFeedback"("questionId");

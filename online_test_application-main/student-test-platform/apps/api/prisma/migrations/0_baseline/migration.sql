-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STUDENT');
CREATE TYPE "TestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "QuestionSourceType" AS ENUM ('IMPORTED', 'MANUAL');
CREATE TYPE "QuestionAnswerType" AS ENUM ('OPTIONS', 'TEXT');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'CORRECT', 'NEEDS_EDIT', 'INVALID', 'APPROVED');
CREATE TYPE "ContentBlockType" AS ENUM ('TEXT', 'IMAGE');
CREATE TYPE "QuestionOrderMode" AS ENUM ('FIXED', 'SHUFFLED');
CREATE TYPE "OptionOrderMode" AS ENUM ('FIXED', 'SHUFFLED');
CREATE TYPE "ResultVisibility" AS ENUM ('HIDDEN', 'AFTER_SUBMISSION', 'AFTER_TEST_END');
CREATE TYPE "SessionStatus" AS ENUM ('NOT_STARTED', 'WAITING', 'READING', 'ANSWERING', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "imageUrl" TEXT NOT NULL, "accentColor" TEXT NOT NULL,
    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
    "id" TEXT NOT NULL, "role" "UserRole" NOT NULL, "name" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "avatarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ImportedDocument" (
    "id" TEXT NOT NULL, "fileName" TEXT NOT NULL, "originalFilePath" TEXT NOT NULL, "extractionJsonPath" TEXT, "outputAssetDir" TEXT,
    "uploadedById" TEXT NOT NULL, "extractionStatus" TEXT NOT NULL DEFAULT 'COMPLETED', "originalPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportedDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuestionBank" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Question" (
    "id" TEXT NOT NULL, "sourceType" "QuestionSourceType" NOT NULL, "importedDocumentId" TEXT, "questionBankId" TEXT,
    "createdById" TEXT, "updatedById" TEXT, "paragraph" TEXT, "questionText" TEXT NOT NULL, "textBeforeImage" TEXT,
    "textAfterImage" TEXT, "imagePath" TEXT, "topic" TEXT, "answerType" "QuestionAnswerType" NOT NULL DEFAULT 'OPTIONS',
    "correctOptionKey" TEXT, "correctTextAnswer" TEXT, "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "finalApproved" BOOLEAN NOT NULL DEFAULT false, "originalPayload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuestionContentBlock" (
    "id" TEXT NOT NULL, "questionId" TEXT NOT NULL, "blockType" "ContentBlockType" NOT NULL, "sortOrder" INTEGER NOT NULL,
    "textContent" TEXT, "imagePath" TEXT, CONSTRAINT "QuestionContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL, "questionId" TEXT NOT NULL, "optionKey" TEXT NOT NULL, "content" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExtractionReview" (
    "id" TEXT NOT NULL, "importedDocumentId" TEXT NOT NULL, "questionId" TEXT NOT NULL, "reviewerId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL, "notes" TEXT, "originalData" JSONB, "finalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ExtractionReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Test" (
    "id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL, "status" "TestStatus" NOT NULL DEFAULT 'DRAFT', "readingDurationSec" INTEGER NOT NULL,
    "answerDurationSec" INTEGER NOT NULL, "thresholdCount" INTEGER NOT NULL, "allowAboveThreshold" BOOLEAN NOT NULL DEFAULT true,
    "maxSelectableCount" INTEGER, "questionOrderMode" "QuestionOrderMode" NOT NULL DEFAULT 'FIXED',
    "optionOrderMode" "OptionOrderMode" NOT NULL DEFAULT 'FIXED', "resultVisibility" "ResultVisibility" NOT NULL DEFAULT 'HIDDEN',
    "lobbyUnlockedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TestQuestion" (
    "id" TEXT NOT NULL, "testId" TEXT NOT NULL, "questionId" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "TestQuestion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StudentTestSession" (
    "id" TEXT NOT NULL, "testId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "status" "SessionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3), "readingStartedAt" TIMESTAMP(3), "readingEndsAt" TIMESTAMP(3), "selectionLockedAt" TIMESTAMP(3),
    "answerStartedAt" TIMESTAMP(3), "answerEndsAt" TIMESTAMP(3), "submittedAt" TIMESTAMP(3), "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "totalSelectedCount" INTEGER NOT NULL DEFAULT 0, "totalAnsweredCount" INTEGER NOT NULL DEFAULT 0, "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0, "scorePercent" DOUBLE PRECISION NOT NULL DEFAULT 0, "totalAnswerTimeSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentTestSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StudentQuestionSelection" (
    "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "questionId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StudentQuestionSelection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StudentAnswer" (
    "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "questionId" TEXT NOT NULL, "selectedOptionKey" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL, "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentAnswer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResultSummary" (
    "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "selectionCount" INTEGER NOT NULL, "answeredCount" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL, "wrongCount" INTEGER NOT NULL, "scorePercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ResultSummary_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL, "userId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
    "payload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_name_key" ON "Avatar"("name");
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
CREATE UNIQUE INDEX "QuestionOption_questionId_optionKey_key" ON "QuestionOption"("questionId", "optionKey");
CREATE UNIQUE INDEX "TestQuestion_testId_questionId_key" ON "TestQuestion"("testId", "questionId");
CREATE UNIQUE INDEX "StudentTestSession_testId_studentId_key" ON "StudentTestSession"("testId", "studentId");
CREATE UNIQUE INDEX "StudentQuestionSelection_sessionId_questionId_key" ON "StudentQuestionSelection"("sessionId", "questionId");
CREATE UNIQUE INDEX "StudentAnswer_sessionId_questionId_key" ON "StudentAnswer"("sessionId", "questionId");
CREATE UNIQUE INDEX "ResultSummary_sessionId_key" ON "ResultSummary"("sessionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportedDocument" ADD CONSTRAINT "ImportedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_importedDocumentId_fkey" FOREIGN KEY ("importedDocumentId") REFERENCES "ImportedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionContentBlock" ADD CONSTRAINT "QuestionContentBlock_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtractionReview" ADD CONSTRAINT "ExtractionReview_importedDocumentId_fkey" FOREIGN KEY ("importedDocumentId") REFERENCES "ImportedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtractionReview" ADD CONSTRAINT "ExtractionReview_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtractionReview" ADD CONSTRAINT "ExtractionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Test" ADD CONSTRAINT "Test_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TestQuestion" ADD CONSTRAINT "TestQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestQuestion" ADD CONSTRAINT "TestQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentTestSession" ADD CONSTRAINT "StudentTestSession_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentTestSession" ADD CONSTRAINT "StudentTestSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionSelection" ADD CONSTRAINT "StudentQuestionSelection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudentTestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionSelection" ADD CONSTRAINT "StudentQuestionSelection_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudentTestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResultSummary" ADD CONSTRAINT "ResultSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudentTestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

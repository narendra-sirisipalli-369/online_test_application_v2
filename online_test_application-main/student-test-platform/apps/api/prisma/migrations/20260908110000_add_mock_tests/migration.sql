-- Add explicit mock-test metadata while leaving existing tests sectional.
CREATE TYPE "TestMode" AS ENUM ('SECTIONAL', 'MOCK');
CREATE TYPE "MockExamType" AS ENUM ('CAT', 'IPMAT');

ALTER TABLE "QuestionBank" ADD COLUMN "mockExamType" "MockExamType";
ALTER TABLE "Test" ADD COLUMN "mode" "TestMode" NOT NULL DEFAULT 'SECTIONAL';
ALTER TABLE "Test" ADD COLUMN "mockExamType" "MockExamType";

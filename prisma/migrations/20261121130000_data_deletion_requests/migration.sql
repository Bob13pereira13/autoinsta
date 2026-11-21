-- CreateEnum
CREATE TYPE "DataDeletionStatus" AS ENUM ('RECEIVED', 'COMPLETED', 'NOT_FOUND', 'FAILED');

-- CreateTable
CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "metaUserIdHash" TEXT NOT NULL,
    "metaUserId" TEXT,
    "status" "DataDeletionStatus" NOT NULL DEFAULT 'RECEIVED',
    "accountsDeleted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataDeletionRequest_confirmationCode_key" ON "DataDeletionRequest"("confirmationCode");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_metaUserIdHash_idx" ON "DataDeletionRequest"("metaUserIdHash");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_status_idx" ON "DataDeletionRequest"("status");


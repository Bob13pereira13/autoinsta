-- Public sign-up, client (workspace) status and the admin area.
--
-- * Workspace.status: PENDING_APPROVAL | ACTIVE | DISABLED | REJECTED. Every
--   existing workspace becomes ACTIVE, with an Instagram account limit equal
--   to the accounts it already has (at least 1), so nothing changes for them.
-- * Existing users count as having confirmed their e-mail: they were created
--   by the operator and set their password through an e-mailed link, and
--   sign-in now requires a confirmed address.
-- * PlatformSettings holds the price per account (R$ 199,00), used for the
--   estimated revenue only. AdminAuditLog records every admin action.


-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkspaceSignupSource" AS ENUM ('LEGACY', 'SELF_SIGNUP', 'ADMIN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

-- AlterEnum
ALTER TYPE "AuthTokenPurpose" ADD VALUE 'VERIFY_EMAIL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "automationsResumedAt" TIMESTAMP(3),
ADD COLUMN     "billingCustomerId" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "documentType" "DocumentType",
ADD COLUMN     "instagramAccountLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "pricePerAccountCents" INTEGER,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "signupSource" "WorkspaceSignupSource" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pricePerAccountCents" INTEGER NOT NULL DEFAULT 19900,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "workspaceId" TEXT,
    "subjectEmailHash" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_workspaceId_createdAt_idx" ON "AdminAuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data
-- ---------------------------------------------------------------------------
UPDATE "Workspace" w
SET "status" = 'ACTIVE',
    "statusChangedAt" = w."createdAt",
    "instagramAccountLimit" = GREATEST(1, (SELECT count(*) FROM "InstagramAccount" a WHERE a."workspaceId" = w."id"))::int;

UPDATE "User" SET "emailVerified" = COALESCE("emailVerified", "createdAt");

INSERT INTO "PlatformSettings" ("id", "pricePerAccountCents", "currency", "updatedAt")
VALUES ('default', 19900, 'BRL', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

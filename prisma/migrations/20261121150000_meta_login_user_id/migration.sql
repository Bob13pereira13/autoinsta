-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "metaLoginUserId" TEXT;

-- CreateIndex
CREATE INDEX "InstagramAccount_metaLoginUserId_idx" ON "InstagramAccount"("metaLoginUserId");


-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "instagramScopedId" TEXT,
ADD COLUMN     "tokenInvalidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "InstagramAccount_instagramScopedId_idx" ON "InstagramAccount"("instagramScopedId");


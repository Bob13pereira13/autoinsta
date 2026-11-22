-- Accounts tab and multi-post Comments automations.
--
-- * InstagramAccount.automationsEnabled: switch that silences every automation
--   of an account without deleting anything.
-- * Automation.activeSince / replyToRecentComments: the comment reconciler only
--   answers comments made after the automation (and its account) became active.
-- * AutomationPost: the posts a COMMENTS automation is limited to (was a single
--   Automation.postId, which is kept and mirrors the first post).


-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "activeSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "replyToRecentComments" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "automationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "automationsResumedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutomationPost" (
    "automationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "postUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationPost_pkey" PRIMARY KEY ("automationId","postId")
);

-- CreateIndex
CREATE INDEX "AutomationPost_postId_idx" ON "AutomationPost"("postId");

-- AddForeignKey
ALTER TABLE "AutomationPost" ADD CONSTRAINT "AutomationPost_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data: existing automations count as active since they were created, so the
-- reconciler stops answering comments older than the automation itself; and
-- each single-post automation gets its post in the new table.
-- ---------------------------------------------------------------------------
UPDATE "Automation" SET "activeSince" = "createdAt";

INSERT INTO "AutomationPost" ("automationId", "postId", "postUrl", "position", "createdAt")
SELECT "id", "postId", "postUrl", 0, CURRENT_TIMESTAMP
FROM "Automation"
WHERE "postId" IS NOT NULL;

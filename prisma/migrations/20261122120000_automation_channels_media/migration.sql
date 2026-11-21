-- CreateEnum
CREATE TYPE "AutomationType" AS ENUM ('COMMENTS', 'STORIES', 'DIRECT');

-- CreateEnum
CREATE TYPE "MessageSlot" AS ENUM ('OPENING', 'FOLLOW_PROMPT', 'MAIN', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DmStatus" ADD VALUE 'SKIPPED_COOLDOWN';
ALTER TYPE "DmStatus" ADD VALUE 'SKIPPED_HUMAN_ACTIVE';

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "replyCooldownHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "triggerStoryMentions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggerStoryReplies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" "AutomationType" NOT NULL DEFAULT 'COMMENTS';

-- CreateTable
CREATE TABLE "AutomationMedia" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT,
    "slot" "MessageSlot",
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotMessage" (
    "mid" TEXT NOT NULL,
    "instagramId" TEXT NOT NULL,
    "recipientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("mid")
);

-- CreateTable
CREATE TABLE "ConversationActivity" (
    "instagramAccountId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "lastHumanMessageAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationActivity_pkey" PRIMARY KEY ("instagramAccountId","recipientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationMedia_storageKey_key" ON "AutomationMedia"("storageKey");

-- CreateIndex
CREATE INDEX "AutomationMedia_workspaceId_idx" ON "AutomationMedia"("workspaceId");

-- CreateIndex
CREATE INDEX "AutomationMedia_automationId_idx" ON "AutomationMedia"("automationId");

-- CreateIndex
CREATE INDEX "BotMessage_instagramId_idx" ON "BotMessage"("instagramId");

-- CreateIndex
CREATE INDEX "BotMessage_createdAt_idx" ON "BotMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ConversationActivity_lastHumanMessageAt_idx" ON "ConversationActivity"("lastHumanMessageAt");

-- CreateIndex
CREATE INDEX "Automation_instagramAccountId_type_isActive_idx" ON "Automation"("instagramAccountId", "type", "isActive");

-- CreateIndex
CREATE INDEX "DmLog_automationId_commenterId_dmSentAt_idx" ON "DmLog"("automationId", "commenterId", "dmSentAt");

-- CreateIndex
CREATE INDEX "DmLog_commentId_idx" ON "DmLog"("commentId");

-- AddForeignKey
ALTER TABLE "AutomationMedia" ADD CONSTRAINT "AutomationMedia_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationMedia" ADD CONSTRAINT "AutomationMedia_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationActivity" ADD CONSTRAINT "ConversationActivity_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data: automations that also answered DMs (dmTriggerEnabled) become three:
-- the original stays a COMMENTS automation, plus a DIRECT copy and a STORIES
-- copy (story replies), with the same keywords and messages. Story replies
-- used to arrive as DMs, so both copies are needed to keep answering
-- everything that is answered today. Each message now fires at most one
-- automation, so nothing is answered twice. Opening DM and public reply are
-- comment-only and are not copied. Tracked links are copied with new slugs;
-- old slugs keep redirecting.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_dm_trigger_copies" AS
SELECT
  a."id" AS "sourceId",
  t."type"::"AutomationType" AS "newType",
  t."suffix" AS "suffix",
  'mig' || replace(gen_random_uuid()::text, '-', '') AS "newId"
FROM "Automation" a
CROSS JOIN (VALUES ('DIRECT', ' (Direct)'), ('STORIES', ' (Stories)')) AS t("type", "suffix")
WHERE a."dmTriggerEnabled" = true;

INSERT INTO "Automation" (
  "id", "workspaceId", "instagramAccountId", "name", "goal",
  "postId", "postUrl", "pendingNextReel", "matchAnyPost",
  "keywords", "matchAnyWord", "type", "triggerStoryReplies", "triggerStoryMentions", "replyCooldownHours",
  "dmTriggerEnabled", "dmMessage",
  "openingDmEnabled", "openingDmMessage", "openingDmButtonLabel", "linkButtonLabel",
  "requireFollow", "followPromptMessage", "followPromptButtonLabel",
  "followUpEnabled", "followUpMessage", "followUpDelayMinutes",
  "publicReplyEnabled", "publicReplyMessage", "publicReplyMessages",
  "isActive", "wholeWordMatch", "reportShareSlug", "reportShareEnabled",
  "createdAt", "updatedAt"
)
SELECT
  c."newId", a."workspaceId", a."instagramAccountId", left(a."name", 100 - length(c."suffix")) || c."suffix", a."goal",
  NULL, NULL, false, false,
  a."keywords", a."matchAnyWord", c."newType", true, false, 24,
  false, a."dmMessage",
  false, NULL, NULL, a."linkButtonLabel",
  a."requireFollow", a."followPromptMessage", a."followPromptButtonLabel",
  a."followUpEnabled", a."followUpMessage", a."followUpDelayMinutes",
  false, NULL, ARRAY[]::TEXT[],
  a."isActive", a."wholeWordMatch", NULL, a."reportShareEnabled",
  -- Same creation time as the original keeps "oldest wins" ordering stable.
  a."createdAt", CURRENT_TIMESTAMP
FROM "_dm_trigger_copies" c
JOIN "Automation" a ON a."id" = c."sourceId";

INSERT INTO "TrackedLink" ("id", "workspaceId", "automationId", "slug", "label", "destinationUrl", "position", "createdAt", "updatedAt")
SELECT
  'mig' || replace(gen_random_uuid()::text, '-', ''),
  l."workspaceId",
  c."newId",
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  l."label",
  l."destinationUrl",
  l."position",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_dm_trigger_copies" c
JOIN "TrackedLink" l ON l."automationId" = c."sourceId";

UPDATE "Automation"
SET "dmTriggerEnabled" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "sourceId" FROM "_dm_trigger_copies");
DROP TABLE "_dm_trigger_copies";

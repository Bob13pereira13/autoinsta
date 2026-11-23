-- The wait before answering (dmDelaySeconds) now also holds the public reply
-- to a comment. Both additions work with the code already running: a new enum
-- value only the new worker writes, and a nullable column.

-- The comment was deleted or hidden during the wait: ignored, not a failure.
ALTER TYPE "DmStatus" ADD VALUE 'SKIPPED_COMMENT_DELETED';

-- Why the public reply was deliberately not posted after the wait.
ALTER TABLE "DmLog" ADD COLUMN "publicReplySkipReason" TEXT;

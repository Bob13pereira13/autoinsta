-- The Overview tab, the only reader of the daily follower totals, was removed
-- together with the job that recorded them. The rows are just per-day follower
-- counts of connected accounts; nothing else references them.
-- IF EXISTS keeps this safe on databases where the table was never created.

-- DropForeignKey
ALTER TABLE IF EXISTS "FollowerSnapshot" DROP CONSTRAINT IF EXISTS "FollowerSnapshot_instagramAccountId_fkey";

-- DropTable
DROP TABLE IF EXISTS "FollowerSnapshot";

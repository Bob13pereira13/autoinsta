-- The Instagram account limit becomes optional.
--
-- * Workspace.instagramAccountLimit: null = follow the platform default.
-- * PlatformSettings.defaultInstagramAccountLimit: the default; null = no limit.
-- * Every existing workspace follows the default, and the default starts as
--   "no limit", so nobody is blocked by this change.


-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "defaultInstagramAccountLimit" INTEGER;

-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "instagramAccountLimit" DROP NOT NULL,
ALTER COLUMN "instagramAccountLimit" DROP DEFAULT;


-- ---------------------------------------------------------------------------
-- Data
-- ---------------------------------------------------------------------------
UPDATE "Workspace" SET "instagramAccountLimit" = NULL;
UPDATE "PlatformSettings" SET "defaultInstagramAccountLimit" = NULL;

-- Wait before the first DM (lib/automation/delivery.ts). 0 = at once, which
-- is how every existing automation keeps behaving.
-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "dmDelaySeconds" INTEGER NOT NULL DEFAULT 0;


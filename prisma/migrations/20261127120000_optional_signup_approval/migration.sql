-- Approval of public sign-ups becomes optional (off by default).
--
-- No workspace changes status here: clients awaiting approval keep waiting,
-- and sign-ups already made (confirmed or not) keep signupAutoActivate = false,
-- so they still need an admin's approval. Only sign-ups made after this
-- deploy, while approval is off, turn ACTIVE when the e-mail is confirmed.

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN "requireSignupApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "signupAutoActivate" BOOLEAN NOT NULL DEFAULT false;

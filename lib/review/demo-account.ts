/**
 * The Meta App Review demo account: a customer that signs in with e-mail and
 * password (e-mail already confirmed, no approval, nothing to solve: sign-in
 * has no anti-bot check), its workspace ACTIVE, the test Instagram account
 * connected, and one automation per channel in English, in "Direct" mode and
 * without "Require follow". Run by scripts/review-account.ts; calling it again
 * resets the automations and sample logs and keeps the connected account.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { hashPassword } from "@/lib/account/password";
import { brand } from "@/config/brand";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import { generateReportShareSlug } from "@/lib/reports/share";

export interface ReviewAccountOptions {
  email: string;
  password: string;
  /** Where the automations' link button leads (e.g. the app's home page). */
  linkUrl: string;
  /** Write a few sample entries to DM Logs (default true). */
  sampleLogs?: boolean;
  /**
   * Connect the Instagram test account from a token (a Facebook Login for
   * Business token, as the app's own login gives). Without it, an account
   * already connected to the workspace is kept.
   */
  instagram?: { id: string; username: string; name?: string | null; encryptedToken: string; webhookSubscribed: boolean };
}

export interface ReviewAccountResult {
  userId: string;
  workspaceId: string;
  instagram: { id: string; username: string } | null;
  automations: { name: string; type: string }[];
  sampleLogs: number;
}

export const DEMO_WORKSPACE_NAME = "Demo Store";

export const DEMO_AUTOMATIONS = [
  {
    type: "COMMENTS",
    name: "Catalog link (comments)",
    keywords: ["LINK"],
    dmMessage: "Hi {username}! Here is the catalog you asked for: {link}",
    publicReplyMessages: ["Sent you a DM 📩", "Check your DMs 📩"],
  },
  {
    type: "STORIES",
    name: "Story replies",
    keywords: [] as string[],
    dmMessage: "Thanks for replying to our story, {username}! Here is the link: {link}",
    publicReplyMessages: [] as string[],
  },
  {
    type: "DIRECT",
    name: "Price list (Direct)",
    keywords: ["PRICE"],
    dmMessage: "Hi {username}! Here is our price list: {link}",
    publicReplyMessages: [] as string[],
  },
] as const;

export async function resetReviewAccount(db: PrismaClient, options: ReviewAccountOptions): Promise<ReviewAccountResult> {
  const email = options.email.trim().toLowerCase();
  const now = new Date();
  const passwordHash = await hashPassword(options.password);

  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash, emailVerified: now, disabledAt: null, locale: "en" },
    create: {
      email,
      name: "App Reviewer",
      passwordHash,
      emailVerified: now,
      locale: "en",
      termsVersion: brand.legal.lastUpdated,
      termsAcceptedAt: now,
    },
  });

  // The reviewer's own workspace, ACTIVE (no approval step).
  let workspace = await db.workspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
  if (!workspace) {
    workspace = await db.workspace.create({
      data: { name: DEMO_WORKSPACE_NAME, ownerId: user.id, status: "ACTIVE", signupSource: "ADMIN", companyName: DEMO_WORKSPACE_NAME },
    });
  } else {
    workspace = await db.workspace.update({
      where: { id: workspace.id },
      data: { status: "ACTIVE", statusChangedAt: now, automationsResumedAt: now, rejectionReason: null },
    });
  }
  await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
  });

  // The test Instagram account: connected from the token given, or the one
  // already connected to this workspace.
  let account = await db.instagramAccount.findFirst({ where: { workspaceId: workspace.id }, orderBy: { connectedAt: "asc" } });
  if (options.instagram) {
    const elsewhere = await db.instagramAccount.findUnique({ where: { instagramId: options.instagram.id } });
    if (elsewhere && elsewhere.workspaceId !== workspace.id) {
      throw new Error(`@${elsewhere.username} is connected to another workspace; disconnect it there first.`);
    }
    const data = {
      username: options.instagram.username,
      name: options.instagram.name ?? null,
      accessToken: options.instagram.encryptedToken,
      tokenInvalidAt: null,
      tokenExpiresAt: null,
      webhookSubscribed: options.instagram.webhookSubscribed,
      metaLogin: "UNIFIED" as const,
      automationsEnabled: true,
    };
    account = elsewhere
      ? await db.instagramAccount.update({ where: { id: elsewhere.id }, data })
      : await db.instagramAccount.create({ data: { ...data, workspaceId: workspace.id, instagramId: options.instagram.id, provider: "META" } });
  } else if (account) {
    account = await db.instagramAccount.update({ where: { id: account.id }, data: { automationsEnabled: true, automationsResumedAt: now } });
  }

  // Start over: the workspace's automations (their logs, links and clicks go
  // with them by cascade).
  await db.automation.deleteMany({ where: { workspaceId: workspace.id } });

  const automations: { name: string; type: string }[] = [];
  let sampleLogs = 0;
  if (account) {
    for (const demo of DEMO_AUTOMATIONS) {
      const created = await db.automation.create({
        data: {
          workspaceId: workspace.id,
          instagramAccountId: account.id,
          type: demo.type,
          name: demo.name,
          keywords: [...demo.keywords],
          matchAnyWord: demo.keywords.length === 0,
          matchAnyPost: demo.type === "COMMENTS",
          triggerStoryReplies: true,
          triggerStoryMentions: false,
          dmMessage: demo.dmMessage,
          linkButtonLabel: "Open link",
          // "Direct" mode: no opening DM, no "Require follow".
          openingDmEnabled: false,
          requireFollow: false,
          publicReplyEnabled: demo.publicReplyMessages.length > 0,
          publicReplyMessages: [...demo.publicReplyMessages],
          publicReplyMessage: demo.publicReplyMessages[0] ?? null,
          // Answers at once, so the screencast does not wait.
          dmDelaySeconds: 0,
          isActive: true,
          activeSince: now,
          reportShareSlug: generateReportShareSlug(),
          trackedLinks: {
            create: { workspaceId: workspace.id, slug: generateTrackedLinkSlug(), destinationUrl: options.linkUrl, label: "Open link", position: 0 },
          },
        },
      });
      automations.push({ name: created.name, type: created.type });

      if (options.sampleLogs !== false) {
        const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
        const sample =
          demo.type === "COMMENTS"
            ? [{ id: "demo_comment_1", who: "demo_follower_1", text: "LINK please", at: 42, status: "SENT" as const, publicReply: true }]
            : demo.type === "DIRECT"
              ? [{ id: "demo_message_1", who: "demo_follower_2", text: "What is the PRICE?", at: 31, status: "SENT" as const, publicReply: false }]
              : [{ id: "demo_story_1", who: "demo_follower_3", text: "Love this!", at: 18, status: "SENT" as const, publicReply: false }];
        for (const log of sample) {
          await db.dmLog.create({
            data: {
              workspaceId: workspace.id,
              automationId: created.id,
              instagramAccountId: account.id,
              commenterId: `${log.id}_sender`,
              commenterName: log.who,
              commentText: log.text,
              commentId: `${log.id}_${created.id}`,
              matchedKeyword: demo.keywords[0] ?? null,
              status: log.status,
              attempts: 1,
              dmSentAt: minutesAgo(log.at),
              publicReplySentAt: log.publicReply ? minutesAgo(log.at) : null,
              createdAt: minutesAgo(log.at),
            },
          });
          sampleLogs++;
        }
      }
    }
  }

  return {
    userId: user.id,
    workspaceId: workspace.id,
    instagram: account ? { id: account.instagramId, username: account.username } : null,
    automations,
    sampleLogs,
  };
}

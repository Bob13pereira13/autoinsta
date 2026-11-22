import { prisma } from "@/lib/db/client";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { ApiError } from "./http";
import { requireScope, type ServiceContext } from "./auth";
import { mediaPublicUrl } from "@/lib/media/urls";
import { postIdsOf } from "@/lib/automation/posts";
import type { AutomationType, Prisma } from "@/app/generated/prisma/client";

export const CAMPAIGN_TYPES = ["COMMENTS", "STORIES", "DIRECT"] as const;

// `type` (COMMENTS | STORIES | DIRECT) and `postIds` were added without
// removing anything: existing readers keep every field they had. `postId` /
// `postUrl` are the first marked post; `postIds` lists them all (empty with
// matchAnyPost or pendingNextReel). `dmTriggerEnabled` stays in the detail and
// is always false — DM replies are now DIRECT automations.
const summarySelect = {
  id: true, name: true, goal: true, type: true, instagramAccountId: true, isActive: true,
  postId: true, postUrl: true, pendingNextReel: true, matchAnyPost: true,
  keywords: true, matchAnyWord: true, dmMessage: true, createdAt: true, updatedAt: true,
  posts: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { postId: true } },
} satisfies Prisma.AutomationSelect;

function withPostIds<T extends { postId: string | null; posts?: Array<{ postId: string }> }>(row: T) {
  const { posts, ...rest } = row;
  return { ...rest, postIds: postIdsOf({ postId: row.postId, posts }) };
}

export async function listCampaigns(context: ServiceContext, filter: { type?: AutomationType } = {}) {
  requireScope(context, "campaigns:read");
  const rows = await prisma.automation.findMany({
    where: { workspaceId: context.workspaceId, ...(filter.type ? { type: filter.type } : {}) }, select: summarySelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100,
  });
  return rows.map(withPostIds);
}

export async function getCampaign(context: ServiceContext, id: string) {
  requireScope(context, "campaigns:read");
  const campaign = await prisma.automation.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: {
      ...summarySelect, wholeWordMatch: true, dmTriggerEnabled: true,
      openingDmEnabled: true, openingDmMessage: true, openingDmButtonLabel: true,
      linkButtonLabel: true, requireFollow: true, followPromptMessage: true,
      followPromptButtonLabel: true, followUpEnabled: true, followUpMessage: true,
      followUpDelayMinutes: true, publicReplyEnabled: true, publicReplyMessage: true,
      publicReplyMessages: true,
      triggerStoryReplies: true, triggerStoryMentions: true, replyCooldownHours: true,
      replyToRecentComments: true,
      trackedLinks: {
        where: { workspaceId: context.workspaceId }, orderBy: TRACKED_LINK_ORDER,
        select: { destinationUrl: true, label: true, position: true },
      },
      media: {
        where: { workspaceId: context.workspaceId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { slot: true, kind: true, mimeType: true, sizeBytes: true, position: true, storageKey: true },
      },
    },
  });
  if (!campaign) throw new ApiError("Campaign not found", 404);
  const [primary, secondary] = campaign.trackedLinks;
  const { media, ...settings } = withPostIds(campaign);
  return {
    ...settings,
    media: (media ?? []).map(({ storageKey, ...m }) => ({ ...m, url: mediaPublicUrl(storageKey) })),
    trackedDestinationUrl: primary?.destinationUrl ?? null,
    secondaryDestinationUrl: secondary?.destinationUrl ?? null,
    secondaryButtonLabel: secondary?.label ?? null,
  };
}

export async function getCampaignStats(context: ServiceContext, id: string) {
  await getCampaign(context, id);
  const [statuses, rawClicks] = await Promise.all([
    prisma.dmLog.groupBy({ by: ["status"], where: { workspaceId: context.workspaceId, automationId: id }, _count: { _all: true } }),
    prisma.linkClick.count({ where: { workspaceId: context.workspaceId, automationId: id } }),
  ]);
  return { campaignId: id, statuses, rawClicks, note: "Raw link requests include previews and repeated clicks; not unique recipients." };
}

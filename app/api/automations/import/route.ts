import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { MAX_POSTS_PER_AUTOMATION, normalizePostInput, postIdsOf, postsCreateData } from "@/lib/automation/posts";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { generateReportShareSlug } from "@/lib/reports/share";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import { automationRuleIssues } from "@/lib/automation/rules";
import { DEFAULT_DM_DELAY_SECONDS } from "@/lib/automation/delivery";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const campaignSchema = z.object({
  // One post (postId) or several (postIds); at least one is required.
  postId: z.string().min(1).optional().nullable(),
  postIds: z.array(z.string().min(1).max(64)).max(MAX_POSTS_PER_AUTOMATION).optional(),
  postUrl: z.string().optional().nullable(),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
  dmMessage: z.string().min(1).max(1000),
  name: z.string().max(100).optional().nullable(),
  goal: z.string().max(120).optional().nullable(),
  publicReplyMessage: z.string().max(1000).optional().nullable(),
  trackedUrl: z.string().optional().nullable(),
  wholeWordMatch: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

const importSchema = z.object({
  instagramAccountId: z.string().min(1),
  campaigns: z
    .array(
      campaignSchema
        .refine((c) => Boolean(c.postId) || Boolean(c.postIds?.length), { message: "postId or postIds is required" })
        // The message must go out whole (Instagram's limits) and never show "{link}".
        .superRefine((c, ctx) => {
          const hasLink = Boolean(c.trackedUrl && /^https?:\/\//i.test(c.trackedUrl));
          for (const issue of automationRuleIssues({ type: "COMMENTS", matchAnyPost: true, keywords: c.keywords, dmMessage: c.dmMessage, hasLink })) {
            ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
          }
        })
    )
    .min(1)
    .max(200),
});

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can import campaigns" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid import data" },
      { status: 400 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    context.workspaceId,
    parsed.data.instagramAccountId
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 400 }
    );
  }

  const existing = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    select: { postId: true, posts: { select: { postId: true } } },
  });
  const usedPostIds = new Set(existing.flatMap((a) => postIdsOf(a)));

  const created: { name: string; postId: string; postIds: string[] }[] = [];
  const skipped: { row: number; reason: string }[] = [];

  let row = 0;
  for (const campaign of parsed.data.campaigns) {
    row++;
    const postList =
      normalizePostInput({
        postIds: campaign.postIds?.length ? campaign.postIds : undefined,
        postId: campaign.postId ?? null,
        postUrl: campaign.postUrl && /^https?:\/\//i.test(campaign.postUrl) ? campaign.postUrl : null,
      }) ?? [];
    if (postList.some((p) => usedPostIds.has(p.id))) {
      skipped.push({ row, reason: "a campaign already exists for this post" });
      continue;
    }

    const validTrackedUrl =
      campaign.trackedUrl && /^https?:\/\//i.test(campaign.trackedUrl)
        ? campaign.trackedUrl
        : null;
    const name =
      (campaign.name ?? "").trim().slice(0, 100) ||
      `Imported: ${campaign.keywords[0]}`;
    const publicReply = (campaign.publicReplyMessage ?? "").trim();

    await prisma.automation.create({
      data: {
        name,
        goal: (campaign.goal ?? "").trim().slice(0, 120) || null,
        postId: postList[0].id,
        postUrl: postList[0].url ?? campaign.postUrl ?? null,
        posts: { create: postsCreateData(postList) },
        keywords: campaign.keywords,
        dmMessage: campaign.dmMessage.slice(0, 1000),
        publicReplyEnabled: Boolean(publicReply),
        publicReplyMessage: publicReply ? publicReply.slice(0, 1000) : null,
        // A new automation: the editor's default wait.
        dmDelaySeconds: DEFAULT_DM_DELAY_SECONDS,
        isActive: campaign.isActive,
        wholeWordMatch: campaign.wholeWordMatch,
        workspaceId: context.workspaceId,
        instagramAccountId: account.id,
        reportShareSlug: generateReportShareSlug(),
        ...(validTrackedUrl
          ? {
              trackedLinks: {
                create: {
                  workspaceId: context.workspaceId,
                  slug: generateTrackedLinkSlug(),
                  label: "Primary campaign link",
                  destinationUrl: validTrackedUrl,
                },
              },
            }
          : {}),
      },
    });

    for (const p of postList) usedPostIds.add(p.id);
    created.push({ name, postId: postList[0].id, postIds: postList.map((p) => p.id) });
  }

  return NextResponse.json({
    success: true,
    data: { created, skipped },
  });
}

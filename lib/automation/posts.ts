import type { Prisma } from "@/app/generated/prisma/client";

/**
 * The posts and reels a COMMENTS automation is limited to (AutomationPost).
 * No posts + matchAnyPost means every post. Automation.postId/postUrl mirror
 * the first post so API v1 readers, older code and a worker that has not been
 * redeployed yet keep working.
 */

export const MAX_POSTS_PER_AUTOMATION = 100;

export interface PostRef {
  id: string;
  url?: string | null;
  publishedAt?: string | Date | null;
}

/** Every post id an automation is bound to: its post rows plus the legacy postId. */
export function postIdsOf(automation: {
  postId?: string | null;
  posts?: Array<{ postId: string }> | null;
}): string[] {
  const ids = (automation.posts ?? []).map((p) => p.postId);
  if (automation.postId && !ids.includes(automation.postId)) ids.push(automation.postId);
  return ids;
}

/**
 * Normalize the three accepted shapes into one list (or undefined when the
 * request did not touch posts): `posts` (objects, used by the dashboard),
 * `postIds` (plain ids), or the legacy single `postId` + `postUrl`.
 * Duplicates are dropped, order is kept.
 */
export function normalizePostInput(input: {
  posts?: PostRef[] | null;
  postIds?: string[] | null;
  postId?: string | null;
  postUrl?: string | null;
}): PostRef[] | undefined {
  let list: PostRef[] | undefined;
  if (input.posts) list = input.posts;
  else if (input.postIds) list = input.postIds.map((id) => ({ id }));
  else if (input.postId !== undefined) list = input.postId ? [{ id: input.postId, url: input.postUrl ?? null }] : [];
  if (!list) return undefined;
  const seen = new Set<string>();
  return list.filter((p) => {
    if (!p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function toDate(value: PostRef["publishedAt"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Replace an automation's posts and keep postId/postUrl on the first one. */
export async function setAutomationPosts(
  tx: Prisma.TransactionClient,
  automationId: string,
  posts: PostRef[]
): Promise<void> {
  await tx.automationPost.deleteMany({ where: { automationId } });
  if (posts.length) {
    await tx.automationPost.createMany({
      data: posts.map((p, position) => ({
        automationId,
        postId: p.id,
        postUrl: p.url ?? null,
        publishedAt: toDate(p.publishedAt),
        position,
      })),
    });
  }
  await tx.automation.update({
    where: { id: automationId },
    data: { postId: posts[0]?.id ?? null, postUrl: posts[0]?.url ?? null },
  });
}

/** Nested-create payload for a new automation's posts. */
export function postsCreateData(posts: PostRef[]) {
  return posts.map((p, position) => ({
    postId: p.id,
    postUrl: p.url ?? null,
    publishedAt: toDate(p.publishedAt),
    position,
  }));
}

/** Select used wherever an automation's posts are read, in button order. */
export const POSTS_SELECT = {
  orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
  select: { postId: true, postUrl: true, publishedAt: true, position: true },
};

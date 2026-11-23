import * as meta from "@/lib/meta/client";
import { zernioRequest } from "@/lib/zernio/client";
import type { InstagramContext } from "./context";

type Comment = {
  id: string;
  message: string;
  createdTime: string;
  from?: { id: string; username?: string };
  replies?: Comment[];
};

export async function getRecentMediaComments({
  context,
  mediaId,
  sinceMs,
  max = 800,
}: {
  context: InstagramContext;
  mediaId: string;
  sinceMs: number;
  max?: number;
}): Promise<meta.InstagramComment[]> {
  if (context.provider === "META")
    return meta.getRecentMediaComments(
      context,
      mediaId,
      sinceMs,
      max
    );
  const results: meta.InstagramComment[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({
      accountId: context.accountId,
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    const page = await zernioRequest<{
      comments: Comment[];
      pagination?: { hasMore: boolean; cursor?: string };
    }>({
      apiKey: context.apiKey,
      path: `/inbox/comments/${encodeURIComponent(mediaId)}?${query}`,
    });
    results.push(
      ...page.comments.map((c) => ({
        id: c.id,
        text: c.message,
        timestamp: c.createdTime,
        from: c.from,
        replies: { data: c.replies?.map((r) => ({ id: r.id, from: r.from })) },
      }))
    );
    cursor = page.pagination?.hasMore ? page.pagination.cursor : undefined;
    if (!cursor || seen.has(cursor)) break;
    seen.add(cursor);
  } while (results.length < max);
  return results
    .filter((c) => !c.timestamp || Date.parse(c.timestamp) >= sinceMs)
    .slice(0, max);
}

/**
 * Before a delayed reply: was the comment deleted or hidden during the wait,
 * and has the account already replied to it? Null when the provider cannot
 * tell (Zernio), so the reply goes as before.
 */
export async function getCommentState({
  context,
  commentId,
  accountInstagramId,
}: {
  context: InstagramContext;
  commentId: string;
  accountInstagramId: string;
}): Promise<{ state: "deleted" | "hidden" | "visible"; ownerReplied: boolean } | null> {
  if (context.provider !== "META") return null;
  return meta.getCommentState(context, commentId, accountInstagramId);
}

export async function getUserMedia({
  context,
  limit = 25,
}: {
  context: InstagramContext;
  limit?: number;
}): Promise<meta.InstagramMedia[]> {
  if (context.provider === "META")
    return meta.getUserMedia(context, limit, context.instagramId);
  const result = await zernioRequest<{
    posts: {
      id: string;
      message: string;
      createdTime: string;
      picture?: string;
      permalink?: string;
      mediaType: string;
      likeCount?: number;
      commentCount?: number;
    }[];
  }>({
    apiKey: context.apiKey,
    path: `/accounts/${encodeURIComponent(context.accountId)}/posts`,
  });
  return result.posts.slice(0, limit).map((p) => ({
    id: p.id,
    caption: p.message,
    timestamp: p.createdTime,
    thumbnail_url: p.picture,
    permalink: p.permalink,
    media_type:
      p.mediaType === "video"
        ? "VIDEO"
        : p.mediaType === "carousel"
          ? "CAROUSEL_ALBUM"
          : "IMAGE",
    media_product_type:
      p.permalink &&
      /^https:\/\/(?:www\.)?instagram\.com\/reel\//.test(p.permalink)
        ? "REELS"
        : undefined,
    like_count: p.likeCount,
    comments_count: p.commentCount,
  }));
}

/** One page of media for the post grid (infinite scroll). */
export async function getUserMediaPage({
  context,
  limit = 24,
  after,
}: {
  context: InstagramContext;
  limit?: number;
  after?: string | null;
}): Promise<{ data: meta.InstagramMedia[]; nextCursor: string | null }> {
  if (context.provider === "META") {
    return meta.getUserMediaPage(context, { limit, after, igUserId: context.instagramId });
  }
  // Other providers only return the most recent posts, in one page.
  return after ? { data: [], nextCursor: null } : { data: await getUserMedia({ context, limit: 25 }), nextCursor: null };
}

export async function getAllUserMedia({
  context,
  max = 500,
}: {
  context: InstagramContext;
  max?: number;
}) {
  return context.provider === "META"
    ? meta.getAllUserMedia(context, max, context.instagramId)
    : getUserMedia({ context, limit: max });
}

export async function getUserInfo({
  context,
}: {
  context: InstagramContext;
}): Promise<meta.InstagramUser> {
  if (context.provider === "META")
    return meta.getUserInfo(context, context.instagramId);
  const result = await zernioRequest<{
    accounts: {
      _id: string;
      platformUserId: string;
      username: string;
      displayName?: string;
      profilePicture?: string;
    }[];
  }>({ apiKey: context.apiKey, path: "/accounts?platform=instagram" });
  const account = result.accounts.find((a) => a._id === context.accountId);
  if (!account)
    throw new Error("Connected Instagram account is unavailable in Zernio");
  return {
    id: account.platformUserId,
    user_id: account.platformUserId,
    username: account.username,
    name: account.displayName,
    profile_picture_url: account.profilePicture,
  };
}

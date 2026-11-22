/**
 * Step "When" of the automation editor, Comments: which posts trigger the
 * automation. Three options, each mapped to the stored fields:
 *
 * - "all"   → matchAnyPost, no marked posts (also the posts published later);
 * - "posts" → the marked posts (at least one);
 * - "next"  → pendingNextReel (binds itself to the next post or reel).
 *
 * The marks in the grid only count with "posts": switching to another option
 * keeps them on screen (switching back restores them) but they are not saved.
 * Pure functions, so the editor and the tests share them.
 */

export type PostScope = "all" | "posts" | "next";

export interface ScopePost {
  id: string;
  url?: string | null;
  publishedAt?: string | null;
}

export interface StoredPostScope {
  postId?: string | null;
  postUrl?: string | null;
  posts?: Array<{ postId: string; postUrl: string | null; publishedAt: string | null }>;
  pendingNextReel?: boolean;
  matchAnyPost?: boolean;
}

/** The option an existing automation opens on, and its marked posts. */
export function postScopeOf(stored: StoredPostScope): { scope: PostScope; posts: ScopePost[] } {
  if (stored.pendingNextReel) return { scope: "next", posts: [] };
  // Marked posts win over the all-posts flag, as on the server. A "next post"
  // automation that already found its reel has it as its marked post.
  if (stored.posts?.length) {
    return {
      scope: "posts",
      posts: stored.posts.map((p) => ({ id: p.postId, url: p.postUrl, publishedAt: p.publishedAt })),
    };
  }
  if (stored.postId && !stored.matchAnyPost) {
    return { scope: "posts", posts: [{ id: stored.postId, url: stored.postUrl ?? null }] };
  }
  if (stored.matchAnyPost) return { scope: "all", posts: [] };
  // No option stored (should not exist: the server refuses it). Open on
  // "specific" with nothing marked, so saving asks for a post instead of
  // silently widening it to every post.
  return { scope: "posts", posts: [] };
}

/** The grid of posts only shows with "Specific posts". */
export function showsPostGrid(scope: PostScope): boolean {
  return scope === "posts";
}

/** "Specific posts" with nothing checked cannot be saved ("Check at least one post"). */
export function postScopeBlocked(scope: PostScope, posts: ScopePost[]): boolean {
  return scope === "posts" && posts.length === 0;
}

/** What is saved for the chosen option. Marks only go with "posts". */
export function postScopePayload(scope: PostScope, posts: ScopePost[]) {
  return {
    posts:
      scope === "posts"
        ? posts.map((p) => ({ id: p.id, url: p.url ?? null, publishedAt: p.publishedAt ?? null }))
        : [],
    matchAnyPost: scope === "all",
    pendingNextReel: scope === "next",
  };
}

/** The scope as the plain-language summary describes it. */
export function summaryScopeOf(scope: PostScope): "any" | "specific" | "next" {
  return scope === "all" ? "any" : scope === "posts" ? "specific" : "next";
}

/**
 * Stories: replies and mentions can both apply, so they are two checkboxes;
 * at least one must be checked ("none"). Mentions carry no text, so mentions
 * alone cannot work with a keyword ("mentionsNeedAnyReply").
 */
export function storyTriggerProblem({
  replies,
  mentions,
  anyReply,
}: {
  replies: boolean;
  mentions: boolean;
  anyReply: boolean;
}): "none" | "mentionsNeedAnyReply" | null {
  if (!replies && !mentions) return "none";
  if (!replies && mentions && !anyReply) return "mentionsNeedAnyReply";
  return null;
}

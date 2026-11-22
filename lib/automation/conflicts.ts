/**
 * Conflicts between automations: another ACTIVE automation of the same account
 * and channel that would catch the same comment or message (same post or "all
 * posts", the same keyword or "any"). Only one of them answers each event, so
 * the owner is told which one, by the same rules the worker uses
 * (lib/automation/select.ts): keyword first, then specific posts, then the
 * oldest.
 *
 * Pure: the editor runs it live on what it shows, the API runs it on save and
 * the automations list tags the rows.
 */
import { selectAutomation, type SelectableAutomation, type TriggerEvent } from "@/lib/automation/select";
import { matchKeywords } from "@/lib/utils/keyword-matcher";
import type { AutomationTypeName } from "@/lib/automation/rules";

export interface ConflictCandidate {
  id: string;
  name: string;
  type: AutomationTypeName;
  createdAt: Date | string;
  isActive: boolean;
  instagramAccountId: string;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch?: boolean;
  matchAnyPost: boolean;
  pendingNextReel: boolean;
  /** Marked posts (and/or the legacy single postId). */
  postIds?: string[];
  postId?: string | null;
  triggerStoryReplies?: boolean;
  triggerStoryMentions?: boolean;
}

export type ConflictReason = "keyword" | "specific" | "older";

export interface Conflict {
  other: { id: string; name: string };
  /** Which of the two answers the events both catch. */
  winner: "this" | "other";
  reason: ConflictReason;
  /** What both catch: the keyword (null = anything) and where. */
  keyword: string | null;
  where: "allPosts" | "samePost" | "nextReel" | "storyReplies" | "storyMentions" | "direct";
  /** This automation would never answer anything: the other one covers all of it and wins. */
  never: boolean;
}

const NEXT_REEL = "\u0000next-reel";
const ANY_POST = "\u0000any-post";

function postsOf(a: ConflictCandidate): string[] {
  const ids = [...(a.postIds ?? [])];
  if (a.postId && !a.matchAnyPost && !ids.includes(a.postId)) ids.push(a.postId);
  return ids;
}

/** As the worker sees it once a waiting automation got its reel. */
function selectable(a: ConflictCandidate): SelectableAutomation {
  const posts = a.pendingNextReel ? [NEXT_REEL] : postsOf(a);
  return {
    id: a.id,
    type: a.type,
    createdAt: new Date(a.createdAt),
    keywords: a.keywords,
    matchAnyWord: a.matchAnyWord,
    wholeWordMatch: a.wholeWordMatch ?? true,
    postIds: posts,
    postId: null,
    matchAnyPost: !a.pendingNextReel && a.matchAnyPost,
    triggerStoryReplies: a.triggerStoryReplies ?? true,
    triggerStoryMentions: a.triggerStoryMentions ?? false,
  };
}

/** A post both listen to, or null. A waiting automation listens to the next reel. */
function sharedPost(a: ConflictCandidate, b: ConflictCandidate): { mediaId: string; where: Conflict["where"] } | null {
  const scope = (x: ConflictCandidate) => (x.pendingNextReel ? "next" : x.matchAnyPost ? "all" : "posts");
  const [sa, sb] = [scope(a), scope(b)];
  if (sa === "next" || sb === "next") {
    // The next reel is not marked on anybody, but "all posts" includes it.
    return (sa === "next" || sa === "all") && (sb === "next" || sb === "all") ? { mediaId: NEXT_REEL, where: "nextReel" } : null;
  }
  if (sa === "all" && sb === "all") return { mediaId: ANY_POST, where: "allPosts" };
  if (sa === "all") return postsOf(b).length ? { mediaId: postsOf(b)[0], where: "samePost" } : null;
  if (sb === "all") return postsOf(a).length ? { mediaId: postsOf(a)[0], where: "samePost" } : null;
  const shared = postsOf(a).find((id) => postsOf(b).includes(id));
  return shared ? { mediaId: shared, where: "samePost" } : null;
}

/** A text both would answer, or null. Uses the real matcher. */
function sharedText(a: ConflictCandidate, b: ConflictCandidate): { text: string; keyword: string | null } | null {
  if (a.matchAnyWord && b.matchAnyWord) return { text: "oi", keyword: null };
  if (a.matchAnyWord) return b.keywords[0] ? { text: b.keywords[0], keyword: b.keywords[0] } : null;
  if (b.matchAnyWord) return a.keywords[0] ? { text: a.keywords[0], keyword: a.keywords[0] } : null;
  for (const ka of a.keywords) {
    for (const kb of b.keywords) {
      // A comment that is exactly one keyword and also triggers the other
      // (named by `a`'s own word when it can be: the one being edited).
      if (matchKeywords(ka, [kb], b.wholeWordMatch ?? true).matched) return { text: ka, keyword: ka };
      if (matchKeywords(kb, [ka], a.wholeWordMatch ?? true).matched) return { text: kb, keyword: kb };
    }
  }
  return null;
}

function sharedEvent(a: ConflictCandidate, b: ConflictCandidate): { event: TriggerEvent; keyword: string | null; where: Conflict["where"] } | null {
  if (a.type === "COMMENTS") {
    const post = sharedPost(a, b);
    const text = post && sharedText(a, b);
    if (!post || !text) return null;
    return { event: { kind: "COMMENT", text: text.text, mediaId: post.mediaId }, keyword: text.keyword, where: post.where };
  }
  if (a.type === "STORIES") {
    if ((a.triggerStoryReplies ?? true) && (b.triggerStoryReplies ?? true)) {
      const text = sharedText(a, b);
      if (text) return { event: { kind: "MESSAGE", channel: "STORY_REPLY", text: text.text }, keyword: text.keyword, where: "storyReplies" };
    }
    // A mention has no text: only automations without keywords take it.
    if (a.triggerStoryMentions && b.triggerStoryMentions && a.matchAnyWord && b.matchAnyWord) {
      return { event: { kind: "MESSAGE", channel: "STORY_MENTION", text: "" }, keyword: null, where: "storyMentions" };
    }
    return null;
  }
  const text = sharedText(a, b);
  return text ? { event: { kind: "MESSAGE", channel: "DIRECT", text: text.text }, keyword: text.keyword, where: "direct" } : null;
}

function isSpecific(a: ConflictCandidate): boolean {
  return a.pendingNextReel || !a.matchAnyPost;
}

/** The other automation catches everything this one catches. */
function covers(other: ConflictCandidate, self: ConflictCandidate): boolean {
  if (self.type === "COMMENTS") {
    const scopeCovered = other.matchAnyPost && !other.pendingNextReel
      ? self.matchAnyPost && !self.pendingNextReel
      : self.pendingNextReel
        ? other.pendingNextReel
        : !self.matchAnyPost && !other.pendingNextReel && postsOf(self).every((id) => postsOf(other).includes(id));
    if (!scopeCovered) return false;
  }
  if (self.type === "STORIES") {
    if ((self.triggerStoryReplies ?? true) && !(other.triggerStoryReplies ?? true)) return false;
    if (self.triggerStoryMentions && self.matchAnyWord && !(other.triggerStoryMentions && other.matchAnyWord)) return false;
  }
  if (self.matchAnyWord) return other.matchAnyWord;
  if (other.matchAnyWord) return false; // a keyword beats "any": self answers
  return (self.wholeWordMatch ?? true) && self.keywords.every((k) => matchKeywords(k, other.keywords, other.wholeWordMatch ?? true).matched);
}

/**
 * The conflicts of `self` (the automation being edited or saved; its id may be
 * a placeholder for a new one) with `others`. Only active automations of the
 * same account and channel count; `self` itself is skipped.
 */
export function findConflicts(self: ConflictCandidate, others: ConflictCandidate[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const other of others) {
    if (other.id === self.id || !other.isActive) continue;
    if (other.instagramAccountId !== self.instagramAccountId || other.type !== self.type) continue;
    const shared = sharedEvent(self, other);
    if (!shared) continue;
    const a = selectable(self);
    const b = selectable(other);
    // Both really answer it (the matcher has the last word).
    if (!selectAutomation([a], shared.event) || !selectAutomation([b], shared.event)) continue;
    const picked = selectAutomation([a, b], shared.event);
    if (!picked) continue;
    const winner = picked.automation.id === self.id ? "this" : "other";
    const reason: ConflictReason =
      self.matchAnyWord !== other.matchAnyWord
        ? "keyword"
        : self.type === "COMMENTS" && isSpecific(self) !== isSpecific(other)
          ? "specific"
          : "older";
    conflicts.push({
      other: { id: other.id, name: other.name },
      winner,
      reason,
      keyword: shared.keyword,
      where: shared.where,
      never: winner === "other" && covers(other, self),
    });
  }
  return conflicts;
}

/**
 * Other active automations of the same account also waiting for the next
 * reel: they will all bind to the same reel. Returns them and the oldest of
 * the group (it wins a tie: same keyword situation, both on that reel).
 */
export function sharedNextReel(
  self: ConflictCandidate,
  others: ConflictCandidate[]
): { others: Array<{ id: string; name: string }>; oldest: { id: string; name: string } } | null {
  if (self.type !== "COMMENTS" || !self.pendingNextReel) return null;
  const waiting = others.filter(
    (o) => o.id !== self.id && o.isActive && o.type === "COMMENTS" && o.pendingNextReel && o.instagramAccountId === self.instagramAccountId
  );
  if (!waiting.length) return null;
  const all = [self, ...waiting].sort(
    (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime() || (x.id < y.id ? -1 : 1)
  );
  return { others: waiting.map((o) => ({ id: o.id, name: o.name })), oldest: { id: all[0].id, name: all[0].name } };
}

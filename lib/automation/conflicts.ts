/**
 * Overlaps between automations: another ACTIVE automation of the same account
 * and channel that would catch the same comment or message (same post or "all
 * posts", the same keyword or "any"). Only one of them answers each event, so
 * the owner is told which one, by the same rules the worker uses
 * (lib/automation/select.ts): keyword first, then specific posts, then the
 * oldest.
 *
 * Two kinds:
 * - "split": a normal combination, both keep answering. One has a keyword and
 *   the other not (the keyword one takes those words, the other the rest), or
 *   one is on specific posts (or the next reel) and the other on all posts
 *   (the specific one takes its posts, the other the rest). An information
 *   note, not a warning.
 * - "conflict": one of them stops answering what both catch, for no reason
 *   but its age: two without keywords on the same posts, the same keyword on
 *   the same posts. A warning ("never" when it answers nothing at all).
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

/** "split": both keep answering, each its part (information). "conflict": one stops answering (warning). */
export type ConflictKind = "split" | "conflict";

export interface Conflict {
  kind: ConflictKind;
  other: { id: string; name: string };
  /** Which of the two answers the events both catch. */
  winner: "this" | "other";
  reason: ConflictReason;
  /** What both catch: the keyword (null = anything) and where. */
  keyword: string | null;
  /** Every word both catch (empty = anything): the ones that decide which answers. */
  keywords: string[];
  where: "allPosts" | "samePost" | "nextReel" | "storyReplies" | "storyMentions" | "direct";
  /** This automation would never answer anything: the other one covers all of it and wins. */
  never: boolean;
  /** Comments: where the one that answers listens (marked posts, the next reel or every post). */
  winnerScope: "all" | "posts" | "nextReel";
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

/**
 * Every keyword both would answer, `a`'s spelling first, without repeats (the
 * matcher ignores case and accents: “PREÇO” and “preco” are one word).
 */
function sharedWords(a: ConflictCandidate, b: ConflictCandidate): string[] {
  if (a.matchAnyWord && b.matchAnyWord) return [];
  const catches = (x: ConflictCandidate, word: string) => x.matchAnyWord || matchKeywords(word, x.keywords, x.wholeWordMatch ?? true).matched;
  const same = (x: string, y: string) => matchKeywords(x, [y], true).matched && matchKeywords(y, [x], true).matched;
  const words: string[] = [];
  for (const word of [...(a.matchAnyWord ? [] : a.keywords), ...(b.matchAnyWord ? [] : b.keywords)]) {
    if (catches(a, word) && catches(b, word) && !words.some((w) => same(w, word))) words.push(word);
  }
  return words;
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
    const keywords = shared.keyword === null ? [] : sharedWords(self, other);
    const answerer = winner === "this" ? self : other;
    conflicts.push({
      // A keyword or specific posts decide: each keeps its part. Age decides: one loses.
      kind: reason === "older" ? "conflict" : "split",
      other: { id: other.id, name: other.name },
      winner,
      reason,
      keyword: shared.keyword,
      keywords: keywords.length || shared.keyword === null ? keywords : [shared.keyword],
      where: shared.where,
      never: winner === "other" && covers(other, self),
      winnerScope: self.type !== "COMMENTS" ? "all" : answerer.pendingNextReel ? "nextReel" : answerer.matchAnyPost ? "all" : "posts",
    });
  }
  return conflicts;
}

/** The kind of an overlap; one saved by an older version has none (only age made a conflict). */
export function kindOf(c: Pick<Conflict, "reason"> & { kind?: ConflictKind }): ConflictKind {
  return c.kind ?? (c.reason === "older" ? "conflict" : "split");
}

/** Warnings (one of the two stops answering) and information notes (both keep answering), apart. */
export function byKind<T extends Pick<Conflict, "reason"> & { kind?: ConflictKind }>(overlaps: T[]): { conflicts: T[]; splits: T[] } {
  return { conflicts: overlaps.filter((c) => kindOf(c) === "conflict"), splits: overlaps.filter((c) => kindOf(c) === "split") };
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

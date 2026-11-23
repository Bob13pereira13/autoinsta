/**
 * Conflict detection: another active automation of the same account and
 * channel that catches the same event. Who answers follows the worker's own
 * selection (keyword first, then specific posts, then the oldest).
 */
import { describe, expect, it } from "vitest";
import { findConflicts, sharedNextReel, type ConflictCandidate } from "@/lib/automation/conflicts";

let seq = 0;
function auto(over: Partial<ConflictCandidate> = {}): ConflictCandidate {
  seq += 1;
  return {
    id: `a${seq}`,
    name: `Automação ${seq}`,
    type: "COMMENTS",
    createdAt: new Date(2026, 0, seq),
    isActive: true,
    instagramAccountId: "acc1",
    keywords: ["link"],
    matchAnyWord: false,
    wholeWordMatch: true,
    matchAnyPost: true,
    pendingNextReel: false,
    postIds: [],
    triggerStoryReplies: true,
    triggerStoryMentions: false,
    ...over,
  };
}

const one = (self: ConflictCandidate, other: ConflictCandidate) => {
  const list = findConflicts(self, [other]);
  expect(list.length).toBeLessThanOrEqual(1);
  return list[0];
};

describe("Comments", () => {
  it("same keyword on all posts: the older answers; the newer never does", () => {
    const older = auto();
    const draft = auto();
    const c = one(draft, older);
    expect(c).toMatchObject({ kind: "conflict", other: { id: older.id }, winner: "other", reason: "older", keyword: "link", keywords: ["link"], where: "allPosts", never: true });
    // Seen from the older one: it wins.
    expect(one(older, draft)).toMatchObject({ kind: "conflict", winner: "this", reason: "older", never: false });
  });

  it("keyword beats “any comment”", () => {
    const any = auto({ matchAnyWord: true, keywords: [] });
    const keyword = auto();
    expect(one(keyword, any)).toMatchObject({ kind: "split", winner: "this", reason: "keyword", never: false });
    expect(one(any, keyword)).toMatchObject({ kind: "split", winner: "other", reason: "keyword", never: false });
  });

  it("specific posts beat all posts (same keyword)", () => {
    const all = auto();
    const specific = auto({ matchAnyPost: false, postIds: ["p1"] });
    expect(one(specific, all)).toMatchObject({ kind: "split", winner: "this", reason: "specific", where: "samePost", winnerScope: "posts" });
    expect(one(all, specific)).toMatchObject({ kind: "split", winner: "other", reason: "specific", never: false, winnerScope: "posts" });
  });

  it("different posts, or different keywords: no conflict", () => {
    expect(one(auto({ matchAnyPost: false, postIds: ["p1"] }), auto({ matchAnyPost: false, postIds: ["p2"] }))).toBeUndefined();
    expect(one(auto({ keywords: ["preço"] }), auto({ keywords: ["link"] }))).toBeUndefined();
  });

  it("the same post marked in both", () => {
    const a = auto({ matchAnyPost: false, postIds: ["p1", "p2"] });
    const b = auto({ matchAnyPost: false, postIds: ["p2"] });
    expect(one(b, a)).toMatchObject({ where: "samePost", winner: "other", reason: "older", never: true });
    // a has p1 too, which b does not cover.
    expect(one(a, b)).toMatchObject({ winner: "this" });
  });

  it("keywords compared like the matcher: accents, phrases, part of a word", () => {
    expect(one(auto({ keywords: ["PREÇO"] }), auto({ keywords: ["preco"] }))?.keyword).toBeTruthy();
    expect(one(auto({ keywords: ["o link"] }), auto({ keywords: ["link"] }))).toBeDefined();
    // Whole word: "links" is not "link".
    expect(one(auto({ keywords: ["links"] }), auto({ keywords: ["link"] }))).toBeUndefined();
    // Part of a word on: "links" contains "link".
    expect(one(auto({ keywords: ["links"] }), auto({ keywords: ["link"], wholeWordMatch: false }))).toBeDefined();
  });

  it("next reel: two waiting ones share the reel; one waiting and one on all posts too", () => {
    const waitingOld = auto({ matchAnyPost: false, pendingNextReel: true });
    const waitingNew = auto({ matchAnyPost: false, pendingNextReel: true });
    expect(one(waitingNew, waitingOld)).toMatchObject({ where: "nextReel", winner: "other", reason: "older", never: true });
    const all = auto();
    // The waiting one will be on that reel only: specific beats all posts.
    expect(one(waitingNew, all)).toMatchObject({ where: "nextReel", winner: "this", reason: "specific" });
    // A waiting one and one on other marked posts do not meet.
    expect(one(waitingNew, auto({ matchAnyPost: false, postIds: ["p1"] }))).toBeUndefined();
  });

  it("only active automations of the same account and channel count; itself is skipped", () => {
    const draft = auto();
    expect(findConflicts(draft, [auto({ isActive: false })])).toEqual([]);
    expect(findConflicts(draft, [auto({ instagramAccountId: "acc2" })])).toEqual([]);
    expect(findConflicts(draft, [auto({ type: "DIRECT" })])).toEqual([]);
    expect(findConflicts(draft, [draft])).toEqual([]);
  });

  it("a keyword not covered by the other keeps it alive (not “never”)", () => {
    const older = auto({ keywords: ["link"] });
    const draft = auto({ keywords: ["link", "preço"] });
    expect(one(draft, older)).toMatchObject({ winner: "other", never: false });
  });

  it("a draft without words yet has no conflict", () => {
    expect(one(auto({ keywords: [] }), auto())).toBeUndefined();
  });
});

describe("Stories", () => {
  const story = (over: Partial<ConflictCandidate> = {}) => auto({ type: "STORIES", matchAnyPost: false, ...over });

  it("replies with the same keyword", () => {
    const older = story();
    expect(one(story(), older)).toMatchObject({ where: "storyReplies", winner: "other" });
  });

  it("mentions only meet between automations without keywords", () => {
    const a = story({ triggerStoryReplies: false, triggerStoryMentions: true, matchAnyWord: true, keywords: [] });
    const b = story({ triggerStoryReplies: false, triggerStoryMentions: true, matchAnyWord: true, keywords: [] });
    expect(one(b, a)).toMatchObject({ where: "storyMentions", winner: "other", never: true });
  });

  it("replies-only and mentions-only do not meet", () => {
    const replies = story({ matchAnyWord: true, keywords: [] });
    const mentions = story({ triggerStoryReplies: false, triggerStoryMentions: true, matchAnyWord: true, keywords: [] });
    expect(one(mentions, replies)).toBeUndefined();
  });

  it("covering: the other must take every trigger this one takes", () => {
    const both = story({ triggerStoryMentions: true, matchAnyWord: true, keywords: [] });
    const repliesOnly = story({ matchAnyWord: true, keywords: [] });
    // `both` is older and wins the replies, but repliesOnly does not take mentions → both still answers mentions.
    expect(one(repliesOnly, both)).toMatchObject({ winner: "other", never: true });
    const newer = story({ triggerStoryMentions: true, matchAnyWord: true, keywords: [] });
    expect(one(newer, repliesOnly)).toMatchObject({ winner: "other", never: false });
  });
});

describe("Direct", () => {
  const direct = (over: Partial<ConflictCandidate> = {}) => auto({ type: "DIRECT", matchAnyPost: false, ...over });

  it("two without keywords: the older answers everything", () => {
    const older = direct({ matchAnyWord: true, keywords: [] });
    const draft = direct({ matchAnyWord: true, keywords: [] });
    expect(one(draft, older)).toMatchObject({ where: "direct", keyword: null, winner: "other", never: true });
  });

  it("a keyword beats the one without", () => {
    const any = direct({ matchAnyWord: true, keywords: [] });
    expect(one(direct({ keywords: ["horário"] }), any)).toMatchObject({ winner: "this", reason: "keyword", keyword: "horário" });
  });
});

describe("next reel shared", () => {
  it("lists the others waiting and the oldest of the group", () => {
    const a = auto({ matchAnyPost: false, pendingNextReel: true, name: "Lançamento" });
    const b = auto({ matchAnyPost: false, pendingNextReel: true, name: "Rascunho" });
    expect(sharedNextReel(b, [a, auto()])).toEqual({ others: [{ id: a.id, name: "Lançamento" }], oldest: { id: a.id, name: "Lançamento" } });
    expect(sharedNextReel(b, [auto({ matchAnyPost: false, pendingNextReel: true, isActive: false })])).toBeNull();
    expect(sharedNextReel(auto(), [a])).toBeNull();
  });
});

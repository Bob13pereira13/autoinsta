import { describe, expect, it } from "vitest";
import { selectAutomation, isGuardedAutomation, type SelectableAutomation, type TriggerEvent } from "@/lib/automation/select";

let seq = 0;
function auto(over: Partial<SelectableAutomation> & { id?: string }): SelectableAutomation {
  seq++;
  return {
    id: over.id ?? `a${seq}`,
    type: "COMMENTS",
    createdAt: new Date(2026, 0, seq),
    keywords: [],
    matchAnyWord: false,
    wholeWordMatch: true,
    postId: null,
    matchAnyPost: false,
    triggerStoryReplies: true,
    triggerStoryMentions: false,
    ...over,
  };
}

const comment = (text: string, mediaId = "post1"): TriggerEvent => ({ kind: "COMMENT", text, mediaId });
const dm = (text: string): TriggerEvent => ({ kind: "MESSAGE", channel: "DIRECT", text });
const storyReply = (text: string): TriggerEvent => ({ kind: "MESSAGE", channel: "STORY_REPLY", text });
const mention: TriggerEvent = { kind: "MESSAGE", channel: "STORY_MENTION", text: "" };

describe("channel separation", () => {
  const direct = auto({ id: "direct", type: "DIRECT", keywords: ["LINK"] });
  const stories = auto({ id: "stories", type: "STORIES", keywords: ["LINK"] });
  const comments = auto({ id: "comments", type: "COMMENTS", keywords: ["LINK"], matchAnyPost: true });
  const all = [direct, stories, comments];

  it("routes a DM to Direct only", () => {
    expect(selectAutomation(all, dm("quero o LINK"))?.automation.id).toBe("direct");
  });

  it("routes a story reply to Stories only, never to Direct", () => {
    expect(selectAutomation(all, storyReply("LINK"))?.automation.id).toBe("stories");
    expect(selectAutomation([direct, comments], storyReply("LINK"))).toBeNull();
  });

  it("routes a comment to Comments only", () => {
    expect(selectAutomation(all, comment("LINK"))?.automation.id).toBe("comments");
  });

  it("respects the story reply toggle", () => {
    const off = auto({ type: "STORIES", keywords: ["LINK"], triggerStoryReplies: false });
    expect(selectAutomation([off], storyReply("LINK"))).toBeNull();
  });
});

describe("story mentions", () => {
  it("fire only Stories automations without keywords that enabled mentions", () => {
    const keyword = auto({ id: "kw", type: "STORIES", keywords: ["LINK"], triggerStoryMentions: true });
    const anyOff = auto({ id: "anyOff", type: "STORIES", matchAnyWord: true, triggerStoryMentions: false });
    const anyOn = auto({ id: "anyOn", type: "STORIES", matchAnyWord: true, triggerStoryMentions: true });
    expect(selectAutomation([keyword, anyOff], mention)).toBeNull();
    expect(selectAutomation([keyword, anyOff, anyOn], mention)?.automation.id).toBe("anyOn");
  });
});

describe("priority: one reply per event", () => {
  it("keyword beats no keyword even when the no-keyword one is older", () => {
    const any = auto({ id: "any", type: "DIRECT", matchAnyWord: true, createdAt: new Date(2020, 0, 1) });
    const kw = auto({ id: "kw", type: "DIRECT", keywords: ["preço"], createdAt: new Date(2026, 5, 1) });
    const result = selectAutomation([any, kw], dm("qual o preço?"));
    expect(result?.automation.id).toBe("kw");
    expect(result?.matchedKeyword).toBe("preço");
    expect(selectAutomation([any, kw], dm("oi"))?.automation.id).toBe("any");
  });

  it("for comments, a specific post beats any post, then the oldest wins", () => {
    const anyOld = auto({ id: "anyOld", matchAnyPost: true, keywords: ["LINK"], createdAt: new Date(2020, 0, 1) });
    const specificNew = auto({ id: "specificNew", postId: "post1", keywords: ["LINK"], createdAt: new Date(2026, 0, 1) });
    const specificOld = auto({ id: "specificOld", postId: "post1", keywords: ["LINK"], createdAt: new Date(2025, 0, 1) });
    expect(selectAutomation([anyOld, specificNew, specificOld], comment("LINK"))?.automation.id).toBe("specificOld");
    // Keyword still comes first: a specific post without keyword loses to any-post with keyword.
    const specificAny = auto({ id: "specificAny", postId: "post1", matchAnyWord: true });
    expect(selectAutomation([specificAny, anyOld], comment("LINK"))?.automation.id).toBe("anyOld");
  });

  it("matches a comment on an ad through its original post", () => {
    const onPost = auto({ id: "onPost", postId: "organic", keywords: ["LINK"] });
    const event: TriggerEvent = { kind: "COMMENT", text: "LINK", mediaId: "ad_media", originalMediaId: "organic" };
    expect(selectAutomation([onPost], event)?.automation.id).toBe("onPost");
  });

  it("breaks exact ties by id so the result is stable", () => {
    const at = new Date(2026, 0, 1);
    const b = auto({ id: "b", type: "DIRECT", matchAnyWord: true, createdAt: at });
    const a = auto({ id: "a", type: "DIRECT", matchAnyWord: true, createdAt: at });
    expect(selectAutomation([b, a], dm("x"))?.automation.id).toBe("a");
  });

  it("keeps the automation that already handled this event (retries, queued jobs)", () => {
    const older = auto({ id: "older", type: "DIRECT", keywords: ["LINK"], createdAt: new Date(2020, 0, 1) });
    const newer = auto({ id: "newer", type: "DIRECT", keywords: ["LINK"], createdAt: new Date(2026, 0, 1) });
    expect(selectAutomation([older, newer], dm("LINK"), { stickyAutomationId: "newer" })?.automation.id).toBe("newer");
    // A sticky id that no longer matches is ignored.
    expect(selectAutomation([older], dm("LINK"), { stickyAutomationId: "gone" })?.automation.id).toBe("older");
  });

  it("returns nothing when no automation matches", () => {
    expect(selectAutomation([auto({ type: "DIRECT", keywords: ["LINK"] })], dm("bom dia"))).toBeNull();
    expect(selectAutomation([], dm("LINK"))).toBeNull();
  });

  it("honours partial matching", () => {
    const partial = auto({ type: "DIRECT", keywords: ["link"], wholeWordMatch: false });
    expect(selectAutomation([partial], dm("manda os links"))).not.toBeNull();
    const whole = auto({ type: "DIRECT", keywords: ["link"], wholeWordMatch: true });
    expect(selectAutomation([whole], dm("manda os links"))).toBeNull();
  });
});

describe("guarded automations", () => {
  it("are the Stories/Direct automations without keywords", () => {
    expect(isGuardedAutomation({ type: "DIRECT", matchAnyWord: true })).toBe(true);
    expect(isGuardedAutomation({ type: "STORIES", matchAnyWord: true })).toBe(true);
    expect(isGuardedAutomation({ type: "DIRECT", matchAnyWord: false })).toBe(false);
    expect(isGuardedAutomation({ type: "COMMENTS", matchAnyWord: true })).toBe(false);
  });
});

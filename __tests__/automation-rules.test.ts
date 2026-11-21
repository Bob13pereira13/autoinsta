import { describe, expect, it } from "vitest";
import { automationRuleIssues, RULE_MESSAGES, sanitizeForType } from "@/lib/automation/rules";

const base = { keywords: ["LINK"] };
const paths = (input: Parameters<typeof automationRuleIssues>[0]) => automationRuleIssues(input).map((i) => i.message);

describe("automation rules", () => {
  it("Comments need a post scope; Stories and Direct do not", () => {
    expect(paths({ ...base, type: "COMMENTS" })).toContain(RULE_MESSAGES.postScope);
    expect(paths({ ...base, type: "COMMENTS", matchAnyPost: true })).toEqual([]);
    expect(paths({ ...base, type: "DIRECT" })).toEqual([]);
  });

  it("need keywords or 'any message'", () => {
    expect(paths({ type: "DIRECT", keywords: [" "] })).toContain(RULE_MESSAGES.keywords);
    expect(paths({ type: "DIRECT", matchAnyWord: true })).toEqual([]);
  });

  it("Stories need at least one trigger, and mentions only without keywords", () => {
    expect(paths({ ...base, type: "STORIES", triggerStoryReplies: false, triggerStoryMentions: false })).toContain(RULE_MESSAGES.storyTrigger);
    expect(paths({ ...base, type: "STORIES", triggerStoryReplies: true, triggerStoryMentions: true })).toContain(RULE_MESSAGES.mentionNeedsAny);
    expect(paths({ type: "STORIES", matchAnyWord: true, triggerStoryReplies: false, triggerStoryMentions: true })).toEqual([]);
  });

  it("refuses media in Comments without the opening DM", () => {
    const media = [{ slot: "MAIN", kind: "IMAGE" as const }];
    expect(paths({ ...base, type: "COMMENTS", matchAnyPost: true, media })).toContain(RULE_MESSAGES.commentsMediaNeedsOpening);
    expect(paths({ ...base, type: "COMMENTS", matchAnyPost: true, media, openingDmEnabled: true, openingDmMessage: "Oi", openingDmButtonLabel: "Quero" })).toEqual([]);
    // Direct/Stories conversations are already open.
    expect(paths({ ...base, type: "DIRECT", media })).toEqual([]);
  });

  it("limits each message to 5 images and 1 video", () => {
    const images = Array.from({ length: 6 }, () => ({ slot: "MAIN", kind: "IMAGE" as const }));
    expect(paths({ ...base, type: "DIRECT", media: images })).toContain(RULE_MESSAGES.tooManyImages);
    const videos = [{ slot: "MAIN", kind: "VIDEO" as const }, { slot: "MAIN", kind: "VIDEO" as const }];
    expect(paths({ ...base, type: "DIRECT", media: videos })).toContain(RULE_MESSAGES.tooManyVideos);
    // The limit is per message: 5 images in the main DM and 5 in the follow-up is fine.
    const split = [...images.slice(0, 5), ...images.slice(0, 5).map((m) => ({ ...m, slot: "FOLLOW_UP" }))];
    expect(paths({ ...base, type: "DIRECT", media: split })).toEqual([]);
  });

  it("clears comment-only options from Stories/Direct and never keeps the old DM toggle", () => {
    const out = sanitizeForType("DIRECT", { postId: "p", matchAnyPost: true, openingDmEnabled: true, publicReplyEnabled: true, publicReplyMessages: ["x"], dmTriggerEnabled: true, keywords: ["A"] });
    expect(out).toMatchObject({ postId: null, matchAnyPost: false, openingDmEnabled: false, publicReplyEnabled: false, publicReplyMessages: [], dmTriggerEnabled: false, keywords: ["A"] });
    expect(sanitizeForType("COMMENTS", { postId: "p", dmTriggerEnabled: true })).toMatchObject({ postId: "p", dmTriggerEnabled: false, triggerStoryMentions: false });
  });
});

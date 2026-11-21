import { describe, expect, it } from "vitest";
import { createI18n } from "../lib/i18n";
import { automationSummary, type SummaryInput } from "../lib/automation/summary";

const base: SummaryInput = {
  type: "COMMENTS",
  scope: "specific",
  keywords: ["LINK"],
  anyWord: false,
  storyReplies: true,
  storyMentions: false,
  hasLink: true,
  requireFollow: false,
  images: 0,
  videos: 0,
  followUp: false,
  followUpMinutes: 0,
  publicReply: false,
  cooldownHours: 24,
};

const en = createI18n("en");
const pt = createI18n("pt-BR");

describe("automationSummary", () => {
  it("describes a comment automation in plain words", () => {
    expect(automationSummary(en, { ...base, scope: "any", publicReply: true, images: 1 })).toBe(
      'When someone comments "LINK" on any of your posts, the person receives your link with an image by DM and the comment is answered publicly.'
    );
  });

  it("contracts the preposition in Portuguese", () => {
    const sentence = automationSummary(pt, base);
    expect(sentence).toContain("na publicação escolhida");
    expect(sentence).not.toContain("em a ");
  });

  it("does not claim to answer everything before a keyword is typed", () => {
    expect(automationSummary(en, { ...base, keywords: [] })).toContain("comments your keyword");
  });

  it("mentions the reply limit for no-keyword Direct and Stories only", () => {
    const direct = automationSummary(en, { ...base, type: "DIRECT", anyWord: true, keywords: [], cooldownHours: 12 });
    expect(direct).toContain("any direct message");
    expect(direct).toContain("at most once every 12 h per person");
    expect(automationSummary(en, { ...base, type: "DIRECT" })).not.toContain("at most once");
    expect(automationSummary(en, { ...base, anyWord: true })).not.toContain("at most once");
  });

  it("includes story mentions only for no-keyword Stories automations", () => {
    const any = automationSummary(en, { ...base, type: "STORIES", anyWord: true, keywords: [], storyMentions: true });
    expect(any).toContain("or mentions you in their story");
    const mentionOnly = automationSummary(en, { ...base, type: "STORIES", anyWord: true, storyReplies: false, storyMentions: true });
    expect(mentionOnly).toMatch(/^When someone mentions you in their story/);
  });

  it("never shows public replies outside Comments", () => {
    expect(automationSummary(en, { ...base, type: "DIRECT", publicReply: true })).not.toContain("publicly");
  });
});

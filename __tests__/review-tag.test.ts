/**
 * "Review" in the automations list: an automation saved before the text rules
 * that breaks one of them ({link} without a link, text above a button over
 * 640 characters, a button label over 20, {link} in the opening DM, plain
 * text over 1000 bytes). It keeps sending but has to be fixed to be saved
 * again. The same rules refuse the save on the server.
 */
import { describe, expect, it } from "vitest";
import { needsReview, textRuleIssues } from "@/lib/automation/text-rules";
import { automationRuleIssues } from "@/lib/automation/rules";
import { DEFAULT_LINK_BUTTON_LABEL } from "@/lib/campaigns/link-label";
import { DEFAULT_LINK_BUTTON_LABEL as FROM_LINKS } from "@/lib/campaigns/links";

const fine = {
  type: "COMMENTS" as const,
  dmMessage: "Oi {username}! Aqui está: {link}",
  linkButtonLabel: "Abrir link",
  openingDmEnabled: false,
  openingDmMessage: null,
  openingDmButtonLabel: null,
  requireFollow: false,
  followPromptMessage: null,
  followPromptButtonLabel: "Já sigo",
  followUpEnabled: false,
  followUpMessage: null,
  trackedLinks: [{ label: "Primary campaign link" }],
};

describe("“Review” tag", () => {
  it("not on an automation that follows the rules", () => {
    expect(needsReview(fine)).toBe(false);
    expect(needsReview({ ...fine, type: "DIRECT", dmMessage: "Abrimos às 9h", trackedLinks: [] })).toBe(false);
  });

  it("{link} without a link", () => {
    expect(needsReview({ ...fine, trackedLinks: [] })).toBe(true);
  });

  it("text above a button over 640 characters (accents and emoji count 1)", () => {
    expect(needsReview({ ...fine, dmMessage: "é".repeat(640) + " {link}" })).toBe(false);
    expect(needsReview({ ...fine, dmMessage: "😀".repeat(641) })).toBe(true);
    expect(needsReview({ ...fine, openingDmEnabled: true, openingDmMessage: "é".repeat(641), openingDmButtonLabel: "Quero" })).toBe(true);
    expect(needsReview({ ...fine, requireFollow: true, followPromptMessage: "é".repeat(641) })).toBe(true);
  });

  it("button labels over 20 characters", () => {
    expect(needsReview({ ...fine, linkButtonLabel: "x".repeat(21) })).toBe(true);
    expect(needsReview({ ...fine, trackedLinks: [{ label: "Primary campaign link" }, { label: "y".repeat(21) }] })).toBe(true);
    expect(needsReview({ ...fine, openingDmEnabled: true, openingDmMessage: "Quer?", openingDmButtonLabel: "Me manda o link agora mesmo" })).toBe(true);
    // A label on something turned off does not count.
    expect(needsReview({ ...fine, openingDmEnabled: false, openingDmButtonLabel: "Me manda o link agora mesmo" })).toBe(false);
  });

  it("{link} in the opening DM; plain text over 1000 bytes", () => {
    expect(needsReview({ ...fine, openingDmEnabled: true, openingDmMessage: "Tome {link}", openingDmButtonLabel: "Quero" })).toBe(true);
    expect(needsReview({ ...fine, dmMessage: "é".repeat(501), trackedLinks: [] })).toBe(true);
    expect(needsReview({ ...fine, followUpEnabled: true, followUpMessage: "😀".repeat(251) })).toBe(true);
  });

  it("the list and the server use the same rules", () => {
    const input = { ...fine, linkButtonLabel: "x".repeat(21), hasLink: true };
    expect(textRuleIssues(input)).toEqual(automationRuleIssues({ ...input, matchAnyPost: true, matchAnyWord: true }));
  });
});

describe("default link button label", () => {
  it("is “Abrir link” everywhere", () => {
    expect(DEFAULT_LINK_BUTTON_LABEL).toBe("Abrir link");
    expect(FROM_LINKS).toBe("Abrir link");
  });
});

/**
 * The rules for the texts an automation sends: what would not go out whole,
 * or would show "{link}" to the person. Shared by the API (refuses the save,
 * via lib/automation/rules.ts) and the automations list (tags older
 * automations that break them with "Review": they keep sending, but must be
 * fixed to be saved again). Pure, with no server imports.
 */
import { buttonTitleTooLong, limitState, messageLimit } from "@/lib/automation/message-limits";

export const TEXT_RULE_MESSAGES = {
  linkTokenWithoutLink: "Your message has {link} but no link is set: the person would see “{link}”. Add the link or remove {link}.",
  linkTokenInOpeningDm: "{link} does not work in the opening DM: the person would see “{link}”. The link goes in the main message.",
  buttonTextTooLong: "With a button, Instagram takes up to 640 characters of text. Shorten the text.",
  textTooLong: "Instagram takes up to 1000 bytes of text, and accents and emojis take more space. Shorten the message.",
  buttonLabelTooLong: "Button labels can have up to 20 characters",
} as const;

export interface TextRuleInput {
  type: "COMMENTS" | "STORIES" | "DIRECT";
  openingDmEnabled?: boolean;
  openingDmMessage?: string | null;
  openingDmButtonLabel?: string | null;
  /** The texts sent, checked against Instagram's limits when given. */
  dmMessage?: string | null;
  /** A link is set (it goes as a button). Undefined = unknown, not checked. */
  hasLink?: boolean;
  linkButtonLabel?: string | null;
  secondaryButtonLabel?: string | null;
  requireFollow?: boolean;
  followPromptMessage?: string | null;
  followPromptButtonLabel?: string | null;
  followUpEnabled?: boolean;
  followUpMessage?: string | null;
}

const LINK_TOKEN = /\{link\}/i;

export function textRuleIssues(input: TextRuleInput): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  const isComments = input.type === "COMMENTS";
  const openingOn = isComments && Boolean(input.openingDmEnabled);
  if (input.dmMessage) {
    if (input.hasLink === false && LINK_TOKEN.test(input.dmMessage)) {
      issues.push({ path: "dmMessage", message: TEXT_RULE_MESSAGES.linkTokenWithoutLink });
    }
    if (input.hasLink !== undefined) {
      const limit = messageLimit(input.dmMessage, input.hasLink ? "button" : "text");
      if (limitState(limit) === "over") {
        issues.push({ path: "dmMessage", message: input.hasLink ? TEXT_RULE_MESSAGES.buttonTextTooLong : TEXT_RULE_MESSAGES.textTooLong });
      }
    }
  }
  if (openingOn && input.openingDmMessage) {
    if (LINK_TOKEN.test(input.openingDmMessage)) {
      issues.push({ path: "openingDmMessage", message: TEXT_RULE_MESSAGES.linkTokenInOpeningDm });
    }
    if (limitState(messageLimit(input.openingDmMessage, "button")) === "over") {
      issues.push({ path: "openingDmMessage", message: TEXT_RULE_MESSAGES.buttonTextTooLong });
    }
  }
  if (input.requireFollow && input.followPromptMessage && limitState(messageLimit(input.followPromptMessage, "button")) === "over") {
    issues.push({ path: "followPromptMessage", message: TEXT_RULE_MESSAGES.buttonTextTooLong });
  }
  if (input.followUpEnabled && input.followUpMessage && limitState(messageLimit(input.followUpMessage, "text")) === "over") {
    issues.push({ path: "followUpMessage", message: TEXT_RULE_MESSAGES.textTooLong });
  }
  const labels: Array<[string, string | null | undefined, boolean]> = [
    ["openingDmButtonLabel", input.openingDmButtonLabel, openingOn],
    ["followPromptButtonLabel", input.followPromptButtonLabel, Boolean(input.requireFollow)],
    ["linkButtonLabel", input.linkButtonLabel, Boolean(input.hasLink)],
    ["secondaryButtonLabel", input.secondaryButtonLabel, Boolean(input.hasLink)],
  ];
  for (const [path, label, used] of labels) {
    if (used && buttonTitleTooLong(label)) issues.push({ path, message: TEXT_RULE_MESSAGES.buttonLabelTooLong });
  }
  return issues;
}

/** An automation as the list has it: does it break a text rule? */
export function needsReview(automation: {
  type?: "COMMENTS" | "STORIES" | "DIRECT" | null;
  dmMessage: string;
  linkButtonLabel?: string | null;
  openingDmEnabled?: boolean;
  openingDmMessage?: string | null;
  openingDmButtonLabel?: string | null;
  requireFollow?: boolean;
  followPromptMessage?: string | null;
  followPromptButtonLabel?: string | null;
  followUpEnabled?: boolean;
  followUpMessage?: string | null;
  trackedLinks: Array<{ label?: string | null }>;
}): boolean {
  return (
    textRuleIssues({
      ...automation,
      type: automation.type ?? "COMMENTS",
      hasLink: automation.trackedLinks.length > 0,
      secondaryButtonLabel: automation.trackedLinks[1]?.label ?? null,
    }).length > 0
  );
}

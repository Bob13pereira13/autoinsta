import { MAX_IMAGES_PER_MESSAGE, MAX_VIDEOS_PER_MESSAGE } from "@/lib/media/storage";

/**
 * Rules for which options combine, per automation type. Shared by the editor
 * (to explain), the API (to refuse) and the CSV import. Messages are English
 * catalog keys, translated in the UI.
 */

export const AUTOMATION_TYPES = ["COMMENTS", "STORIES", "DIRECT"] as const;
export type AutomationTypeName = (typeof AUTOMATION_TYPES)[number];

/** Slots that can carry media. The opening DM is a private reply to a
 *  comment, which Meta documents as text only, so it has none. */
export const MEDIA_SLOTS = ["FOLLOW_PROMPT", "MAIN", "FOLLOW_UP"] as const;
export type MediaSlotName = (typeof MEDIA_SLOTS)[number];

export interface RuleInput {
  type: AutomationTypeName;
  matchAnyPost?: boolean;
  pendingNextReel?: boolean;
  postId?: string | null;
  matchAnyWord?: boolean;
  keywords?: string[];
  openingDmEnabled?: boolean;
  openingDmMessage?: string | null;
  openingDmButtonLabel?: string | null;
  triggerStoryReplies?: boolean;
  triggerStoryMentions?: boolean;
  media?: Array<{ slot: string; kind: "IMAGE" | "VIDEO" }>;
}

export interface RuleIssue {
  path: string;
  message: string;
}

export const RULE_MESSAGES = {
  postScope: "Choose which post(s) trigger the automation",
  keywords: "Add at least one keyword, or answer any message",
  openingDm: "Opening DM needs a message and a button label",
  storyTrigger: "Choose at least one: story replies or story mentions",
  mentionNeedsAny: "Story mentions have no text, so they only work without keywords",
  commentsMediaNeedsOpening:
    "In Comments, images and videos are only sent after the person taps the opening DM button. Turn on the opening DM or remove the media.",
  tooManyImages: "Up to 5 images per message",
  tooManyVideos: "Up to 1 video per message",
} as const;

export function automationRuleIssues(input: RuleInput): RuleIssue[] {
  const issues: RuleIssue[] = [];

  if (input.type === "COMMENTS" && !input.matchAnyPost && !input.pendingNextReel && !input.postId) {
    issues.push({ path: "postId", message: RULE_MESSAGES.postScope });
  }
  if (!input.matchAnyWord && (input.keywords ?? []).filter((k) => k.trim()).length === 0) {
    issues.push({ path: "keywords", message: RULE_MESSAGES.keywords });
  }
  if (
    input.type === "COMMENTS" &&
    input.openingDmEnabled &&
    (!input.openingDmMessage?.trim() || !input.openingDmButtonLabel?.trim())
  ) {
    issues.push({ path: "openingDmMessage", message: RULE_MESSAGES.openingDm });
  }
  if (input.type === "STORIES") {
    if (!input.triggerStoryReplies && !input.triggerStoryMentions) {
      issues.push({ path: "triggerStoryReplies", message: RULE_MESSAGES.storyTrigger });
    }
    if (input.triggerStoryMentions && !input.matchAnyWord) {
      issues.push({ path: "triggerStoryMentions", message: RULE_MESSAGES.mentionNeedsAny });
    }
  }

  const media = input.media ?? [];
  if (input.type === "COMMENTS" && media.length > 0 && !input.openingDmEnabled) {
    issues.push({ path: "media", message: RULE_MESSAGES.commentsMediaNeedsOpening });
  }
  for (const slot of MEDIA_SLOTS) {
    const inSlot = media.filter((m) => m.slot === slot);
    if (inSlot.filter((m) => m.kind === "IMAGE").length > MAX_IMAGES_PER_MESSAGE) {
      issues.push({ path: `media.${slot}`, message: RULE_MESSAGES.tooManyImages });
    }
    if (inSlot.filter((m) => m.kind === "VIDEO").length > MAX_VIDEOS_PER_MESSAGE) {
      issues.push({ path: `media.${slot}`, message: RULE_MESSAGES.tooManyVideos });
    }
  }
  return issues;
}

/**
 * Clear what a type cannot use, so a Direct automation never keeps a post or a
 * public reply around (e.g. after the type was changed in the editor).
 */
export function sanitizeForType<T extends Record<string, unknown>>(type: AutomationTypeName, data: T): T {
  const out: Record<string, unknown> = { ...data };
  if (type !== "COMMENTS") {
    Object.assign(out, {
      postId: null,
      postUrl: null,
      matchAnyPost: false,
      pendingNextReel: false,
      openingDmEnabled: false,
      openingDmMessage: null,
      openingDmButtonLabel: null,
      publicReplyEnabled: false,
      publicReplyMessage: null,
      publicReplyMessages: [],
    });
  }
  if (type !== "STORIES") {
    Object.assign(out, { triggerStoryReplies: true, triggerStoryMentions: false });
  }
  // The old per-campaign DM toggle is replaced by Direct/Stories automations.
  out.dmTriggerEnabled = false;
  return out as T;
}

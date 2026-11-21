import type { AutomationType } from "@/app/generated/prisma/client";
import type { MessageChannel } from "@/lib/meta/webhook";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

/**
 * Picks the single automation an inbound comment or message fires.
 *
 * Rules (each comment, story reply, mention or DM fires AT MOST ONE):
 * 1. Channel: comments → COMMENTS; story replies / mentions → STORIES (each
 *    behind its own toggle); any other DM → DIRECT.
 * 2. Must match: keyword automations need a keyword hit; automations without
 *    keywords ("any word") match anything. A story mention has no text, so
 *    only automations without keywords fire on it.
 * 3. Priority: with keyword beats without keyword; for comments, a specific
 *    post beats "any post"; then the oldest automation; then the id.
 * 4. Sticky: if this event already has a log for one of the matching
 *    automations (a retry, or a job queued before a deploy), that one wins.
 */

export type TriggerEvent =
  | { kind: "COMMENT"; text: string; mediaId: string; originalMediaId?: string }
  | { kind: "MESSAGE"; channel: MessageChannel; text: string };

export interface SelectableAutomation {
  id: string;
  type: AutomationType;
  createdAt: Date;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch: boolean;
  postId: string | null;
  matchAnyPost: boolean;
  triggerStoryReplies: boolean;
  triggerStoryMentions: boolean;
}

export interface Selection<T> {
  automation: T;
  matchedKeyword: string | null;
}

export function automationTypeFor(event: TriggerEvent): AutomationType {
  if (event.kind === "COMMENT") return "COMMENTS";
  return event.channel === "DIRECT" ? "DIRECT" : "STORIES";
}

function listensTo(automation: SelectableAutomation, event: TriggerEvent): boolean {
  if (automation.type !== automationTypeFor(event)) return false;
  if (event.kind === "COMMENT") {
    return (
      automation.matchAnyPost ||
      (automation.postId !== null &&
        (automation.postId === event.mediaId || automation.postId === event.originalMediaId))
    );
  }
  if (event.channel === "STORY_REPLY") return automation.triggerStoryReplies;
  if (event.channel === "STORY_MENTION") {
    return automation.triggerStoryMentions && automation.matchAnyWord;
  }
  return true;
}

function isSpecificPost(automation: SelectableAutomation, event: TriggerEvent): boolean {
  return event.kind === "COMMENT" && !automation.matchAnyPost && automation.postId !== null;
}

export function selectAutomation<T extends SelectableAutomation>(
  candidates: T[],
  event: TriggerEvent,
  options: { stickyAutomationId?: string | null } = {}
): Selection<T> | null {
  const matches: Array<Selection<T> & { hasKeyword: boolean; specific: boolean }> = [];

  for (const automation of candidates) {
    if (!listensTo(automation, event)) continue;
    if (automation.matchAnyWord) {
      matches.push({ automation, matchedKeyword: null, hasKeyword: false, specific: isSpecificPost(automation, event) });
      continue;
    }
    const result = matchKeywords(event.text, automation.keywords, automation.wholeWordMatch);
    if (result.matched) {
      matches.push({ automation, matchedKeyword: result.matchedKeyword, hasKeyword: true, specific: isSpecificPost(automation, event) });
    }
  }

  if (matches.length === 0) return null;

  const sticky = options.stickyAutomationId
    ? matches.find((m) => m.automation.id === options.stickyAutomationId)
    : undefined;
  if (sticky) return { automation: sticky.automation, matchedKeyword: sticky.matchedKeyword };

  matches.sort((a, b) => {
    if (a.hasKeyword !== b.hasKeyword) return a.hasKeyword ? -1 : 1;
    if (a.specific !== b.specific) return a.specific ? -1 : 1;
    const byAge = a.automation.createdAt.getTime() - b.automation.createdAt.getTime();
    if (byAge !== 0) return byAge;
    return a.automation.id < b.automation.id ? -1 : a.automation.id > b.automation.id ? 1 : 0;
  });

  return { automation: matches[0].automation, matchedKeyword: matches[0].matchedKeyword };
}

/** Automations that answer anything on STORIES/DIRECT: rate-limited per person. */
export function isGuardedAutomation(automation: Pick<SelectableAutomation, "type" | "matchAnyWord">): boolean {
  return automation.type !== "COMMENTS" && automation.matchAnyWord;
}

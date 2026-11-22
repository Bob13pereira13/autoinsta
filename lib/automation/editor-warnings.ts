/**
 * Every condition the automation editor warns about, as data: which field, how
 * serious and why. Pure, so each condition is tested on its own (it shows when
 * it should and goes away once fixed); the editor only turns ids into text.
 *
 * Tones:
 * - "warning": heads-up, saves normally (yellow);
 * - "danger": high risk, saves normally (red);
 * - "error": the form cannot be saved until it is fixed.
 */
import type { PostScope } from "@/lib/automation/editor-scope";
import { postScopeBlocked, storyTriggerProblem } from "@/lib/automation/editor-scope";
import { buttonTitleTooLong, limitState, messageLimit, type MessageLimit } from "@/lib/automation/message-limits";
import { foldDiacritics, normalizeArabicScript, stripSpecialCharacters } from "@/lib/utils/keyword-matcher";

export type WarningTone = "warning" | "danger" | "error";

export type WarningField =
  | "scope"
  | "storyTriggers"
  | "keywords"
  | "match"
  | "opening"
  | "openingLabel"
  | "follow"
  | "followLabel"
  | "main"
  | "linkLabel"
  | "secondLinkLabel"
  | "media"
  | "followUp"
  | "publicReply";

export type WarningId =
  | "postScopeEmpty"
  | "storyNone"
  | "storyMentionsNeedAny"
  | "storyMentionsWithKeyword"
  | "keywordMissing"
  | "keywordTooMany"
  | "keywordTooLong"
  | "keywordDuplicate"
  | "keywordShortPartial"
  | "keywordShort"
  | "keywordCommon"
  | "allPostsAnyComment"
  | "directAny"
  | "openingIncomplete"
  | "openingLinkToken"
  | "followWithoutOpening"
  | "followLinkToken"
  | "mainMissing"
  | "mainTokenWithoutLink"
  | "mainLinkWithoutToken"
  | "labelTooLong"
  | "textNearLimit"
  | "textOverLimit"
  | "mediaWithoutOpening"
  | "followUpWithoutButton"
  | "followUpLate"
  | "followUpLinkToken"
  | "publicReplySingle"
  | "publicReplyLink";

export interface EditorWarning {
  id: WarningId;
  tone: WarningTone;
  field: WarningField;
  /** The keyword concerned. */
  word?: string;
  /** For the length warnings. */
  limit?: MessageLimit;
}

export interface EditorDraft {
  type: "COMMENTS" | "STORIES" | "DIRECT";
  postScope: PostScope;
  selectedPostCount: number;
  matchAnyWord: boolean;
  keywords: string[];
  wholeWordMatch: boolean;
  triggerStoryReplies: boolean;
  triggerStoryMentions: boolean;
  openingDmEnabled: boolean;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  requireFollow: boolean;
  followPromptMessage: string;
  followPromptButtonLabel: string;
  dmMessage: string;
  hasLink: boolean;
  linkButtonLabel: string;
  hasSecondLink: boolean;
  secondaryButtonLabel: string;
  mediaCount: number;
  followUpEnabled: boolean;
  followUpMessage: string;
  followUpDelayMinutes: number;
  publicReplyEnabled: boolean;
  publicReplyMessages: string[];
}

export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_CHARS = 50;
/** The thank-you is sent inside Instagram's 24 h window; this close to it, it may not go. */
export const FOLLOW_UP_LATE_MINUTES = 23 * 60;

/**
 * Words that nearly every comment has (articles, pronouns, greetings and
 * reactions in Portuguese, English and Spanish), compared without case or
 * accents. A keyword like this answers almost everyone.
 */
const COMMON_WORDS = new Set(
  (
    "a o e de da do das dos em um uma que eu me se no na pra para com por mais muito sim nao oi ola top lindo linda lindos " +
    "amei amo show kkk kkkk haha ok obrigado obrigada bom boa vc voce " +
    "the and or to of in is it you i my yes no hi hello love wow nice cool thanks " +
    "el la y hola si"
  ).split(" ")
);

const LINK_TOKEN = /\{link\}/i;
const LINK_IN_TEXT = /https?:\/\/|www\.|\{link\}/i;

/** A keyword as the matcher compares it: no case, accents, emoji or punctuation. */
export function normalizeKeyword(keyword: string): string {
  return foldDiacritics(stripSpecialCharacters(normalizeArabicScript(keyword))).toLowerCase();
}

function keywordWarnings(draft: EditorDraft): EditorWarning[] {
  if (draft.matchAnyWord) return [];
  const out: EditorWarning[] = [];
  if (draft.keywords.length === 0) return [{ id: "keywordMissing", tone: "error", field: "keywords" }];
  if (draft.keywords.length > MAX_KEYWORDS) out.push({ id: "keywordTooMany", tone: "error", field: "keywords" });
  const seen = new Set<string>();
  for (const word of draft.keywords) {
    if ([...word].length > MAX_KEYWORD_CHARS) {
      out.push({ id: "keywordTooLong", tone: "error", field: "keywords", word });
      continue;
    }
    const norm = normalizeKeyword(word);
    if (!norm) continue;
    if (seen.has(norm)) {
      out.push({ id: "keywordDuplicate", tone: "warning", field: "keywords", word });
      continue;
    }
    seen.add(norm);
    // Numbers ("1", "08") are deliberate codes, not accidents.
    const letters = /\p{L}/u.test(norm) && !/^\p{N}+$/u.test(norm);
    const length = [...norm].length;
    if (letters && !draft.wholeWordMatch && length <= 3) {
      out.push({ id: "keywordShortPartial", tone: "danger", field: "keywords", word });
    } else if (letters && length <= 2) {
      out.push({ id: "keywordShort", tone: "warning", field: "keywords", word });
    } else if (COMMON_WORDS.has(norm)) {
      out.push({ id: "keywordCommon", tone: "warning", field: "keywords", word });
    }
  }
  return out;
}

function lengthWarning(text: string, kind: "button" | "text", field: WarningField): EditorWarning[] {
  if (!text) return [];
  const limit = messageLimit(text, kind);
  const state = limitState(limit);
  if (state === "over") return [{ id: "textOverLimit", tone: "error", field, limit }];
  if (state === "near") return [{ id: "textNearLimit", tone: "warning", field, limit }];
  return [];
}

/** What the main message sends: above a button when it has a link, plain text otherwise. */
export function mainMessageKind(draft: Pick<EditorDraft, "hasLink">): "button" | "text" {
  return draft.hasLink ? "button" : "text";
}

export function editorWarnings(draft: EditorDraft): EditorWarning[] {
  const out: EditorWarning[] = [];
  const isComments = draft.type === "COMMENTS";
  const anyWord = draft.matchAnyWord;

  // Step 1 — When.
  if (isComments && postScopeBlocked(draft.postScope, Array.from({ length: draft.selectedPostCount }, (_, i) => ({ id: String(i) })))) {
    out.push({ id: "postScopeEmpty", tone: "error", field: "scope" });
  }
  if (draft.type === "STORIES") {
    const problem = storyTriggerProblem({ replies: draft.triggerStoryReplies, mentions: draft.triggerStoryMentions, anyReply: anyWord });
    if (problem === "none") out.push({ id: "storyNone", tone: "error", field: "storyTriggers" });
    else if (problem === "mentionsNeedAnyReply") out.push({ id: "storyMentionsNeedAny", tone: "error", field: "storyTriggers" });
    else if (draft.triggerStoryMentions && !anyWord) out.push({ id: "storyMentionsWithKeyword", tone: "warning", field: "storyTriggers" });
  }

  // Step 2 — Keyword.
  out.push(...keywordWarnings(draft));
  if (isComments && draft.postScope === "all" && anyWord) out.push({ id: "allPostsAnyComment", tone: "danger", field: "match" });
  if (draft.type === "DIRECT" && anyWord) out.push({ id: "directAny", tone: "danger", field: "match" });

  // Step 3 — What the person receives.
  const openingOn = isComments && draft.openingDmEnabled;
  if (openingOn) {
    if (!draft.openingDmMessage.trim() || !draft.openingDmButtonLabel.trim()) {
      out.push({ id: "openingIncomplete", tone: "error", field: "opening" });
    }
    if (LINK_TOKEN.test(draft.openingDmMessage)) out.push({ id: "openingLinkToken", tone: "error", field: "opening" });
    out.push(...lengthWarning(draft.openingDmMessage, "button", "opening"));
    if (buttonTitleTooLong(draft.openingDmButtonLabel)) out.push({ id: "labelTooLong", tone: "error", field: "openingLabel" });
  }
  if (draft.requireFollow) {
    if (isComments && !draft.openingDmEnabled) out.push({ id: "followWithoutOpening", tone: "warning", field: "follow" });
    if (LINK_TOKEN.test(draft.followPromptMessage)) out.push({ id: "followLinkToken", tone: "warning", field: "follow" });
    out.push(...lengthWarning(draft.followPromptMessage, "button", "follow"));
    if (buttonTitleTooLong(draft.followPromptButtonLabel)) out.push({ id: "labelTooLong", tone: "error", field: "followLabel" });
  }
  if (!draft.dmMessage.trim()) {
    out.push({ id: "mainMissing", tone: "error", field: "main" });
  } else {
    const token = LINK_TOKEN.test(draft.dmMessage);
    if (!draft.hasLink && token) out.push({ id: "mainTokenWithoutLink", tone: "error", field: "main" });
    if (draft.hasLink && !token) out.push({ id: "mainLinkWithoutToken", tone: "warning", field: "main" });
    out.push(...lengthWarning(draft.dmMessage, mainMessageKind(draft), "main"));
  }
  if (draft.hasLink && buttonTitleTooLong(draft.linkButtonLabel)) out.push({ id: "labelTooLong", tone: "error", field: "linkLabel" });
  if (draft.hasLink && draft.hasSecondLink && buttonTitleTooLong(draft.secondaryButtonLabel)) {
    out.push({ id: "labelTooLong", tone: "error", field: "secondLinkLabel" });
  }
  if (isComments && !draft.openingDmEnabled && draft.mediaCount > 0) out.push({ id: "mediaWithoutOpening", tone: "error", field: "media" });
  if (draft.followUpEnabled) {
    // In Comments the first reply is the only message until the person taps a button.
    if (isComments && !draft.openingDmEnabled && !draft.requireFollow) {
      out.push({ id: "followUpWithoutButton", tone: "warning", field: "followUp" });
    }
    if (draft.followUpDelayMinutes >= FOLLOW_UP_LATE_MINUTES) out.push({ id: "followUpLate", tone: "warning", field: "followUp" });
    if (LINK_TOKEN.test(draft.followUpMessage)) out.push({ id: "followUpLinkToken", tone: "warning", field: "followUp" });
    out.push(...lengthWarning(draft.followUpMessage, "text", "followUp"));
  }

  // Step 4 — Public reply.
  if (isComments && draft.publicReplyEnabled) {
    const replies = draft.publicReplyMessages.map((m) => m.trim()).filter(Boolean);
    if (replies.length === 1) out.push({ id: "publicReplySingle", tone: "warning", field: "publicReply" });
    if (replies.some((r) => LINK_IN_TEXT.test(r))) out.push({ id: "publicReplyLink", tone: "warning", field: "publicReply" });
  }
  return out;
}

/** Media storage: a heads-up from 80% and red once full. */
export function storageState(usedBytes: number, quotaBytes: number): "ok" | "near" | "full" {
  if (usedBytes >= quotaBytes) return "full";
  if (usedBytes >= quotaBytes * 0.8) return "near";
  return "ok";
}

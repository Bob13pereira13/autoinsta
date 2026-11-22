/**
 * Instagram's limits for what an automation sends, shared by the editor (the
 * counters and errors), the API (refuses what would not go out whole) and the
 * sending code (cuts safely, never in the middle of a character).
 *
 * - A plain text message (no button): UTF-8, at most 1000 BYTES (Meta, Send
 *   Messages). An accented letter takes 2 bytes, an emoji 4.
 * - Text above buttons (button template: the main message when it has a link,
 *   the opening DM, the follow request): at most 640 characters.
 * - A button's label: at most 20 characters.
 *
 * Characters are counted as Unicode code points, so an emoji is one character
 * and is never split in two. `{username}` is measured as the longest possible
 * Instagram username (30), so a message that fits here fits for everyone.
 */

export const TEXT_MAX_BYTES = 1000;
export const BUTTON_TEXT_MAX_CHARS = 640;
export const BUTTON_TITLE_MAX_CHARS = 20;
/** Instagram usernames have at most 30 characters (ASCII). */
export const USERNAME_MAX_CHARS = 30;

const encoder = new TextEncoder();

export function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

/** Characters as people count them: emoji and accented letters are one each. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** The first `max` characters (code points), never splitting a surrogate pair. */
export function truncateChars(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  let count = 0;
  for (const char of text) {
    if (count === max) break;
    out += char;
    count++;
  }
  return out;
}

/** The longest prefix that fits in `maxBytes` of UTF-8, cut between characters. */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  let out = "";
  let bytes = 0;
  for (const char of text) {
    const size = utf8Bytes(char);
    if (bytes + size > maxBytes) break;
    out += char;
    bytes += size;
  }
  return out;
}

const LONGEST_NAME = "x".repeat(USERNAME_MAX_CHARS);

/** The text as sent to the person with the longest possible name. */
function withLongestName(text: string): string {
  return text.replace(/\{username\}/gi, LONGEST_NAME);
}

export type MessageLimit = { unit: "bytes" | "chars"; max: number; used: number };

/**
 * How much of its limit a message uses, as it will be sent.
 * - `button`: the text goes above a button (640 characters); `{link}` is
 *   taken out of it, since the link is the button.
 * - `text`: a plain message (1000 bytes).
 */
export function messageLimit(text: string, kind: "button" | "text"): MessageLimit {
  const sent = withLongestName(text);
  if (kind === "button") {
    const body = sent.replace(/\s*\{link\}\s*/gi, " ").trim();
    return { unit: "chars", max: BUTTON_TEXT_MAX_CHARS, used: charCount(body) };
  }
  return { unit: "bytes", max: TEXT_MAX_BYTES, used: utf8Bytes(sent) };
}

/** Over the limit: cannot be saved. Near (90% or more): a heads-up. */
export function limitState(limit: MessageLimit): "ok" | "near" | "over" {
  if (limit.used > limit.max) return "over";
  if (limit.used >= Math.ceil(limit.max * 0.9)) return "near";
  return "ok";
}

export function buttonTitleTooLong(label: string | null | undefined): boolean {
  return charCount(label ?? "") > BUTTON_TITLE_MAX_CHARS;
}

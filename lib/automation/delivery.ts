/**
 * Step 3 of the editor, "What the person receives": how the content reaches
 * the person and in which order. Pure, shared by the editor, the preview, the
 * summary and the API.
 *
 * - "direct": the person gets the main message without tapping anything. In
 *   Comments that is the one private reply Instagram allows (text with a link
 *   button), so images and videos cannot go; in Stories and Direct the
 *   conversation is open and text, images and videos all go.
 * - "steps": an opening DM (Comments only) and/or a follow request come first,
 *   each with a button; the main message goes after the tap.
 */

export type AutomationKind = "COMMENTS" | "STORIES" | "DIRECT";
export type DeliveryMode = "direct" | "steps";

/**
 * Wait before answering, in seconds: at once, 30 s, 1 min, 5 min. In Comments
 * the public reply and the DM both go after it; in Stories and Direct, the DM.
 */
export const DM_DELAY_OPTIONS = [0, 30, 60, 300] as const;
export type DmDelay = (typeof DM_DELAY_OPTIONS)[number];
/** What a new automation starts with (the editor and the API). Saved ones keep theirs. */
export const DEFAULT_DM_DELAY_SECONDS: DmDelay = 30;

/** The mode an automation opens on, from what it has saved. */
export function deliveryModeOf(a: { type: AutomationKind; openingDmEnabled?: boolean | null; requireFollow?: boolean | null }): DeliveryMode {
  const opening = a.type === "COMMENTS" && Boolean(a.openingDmEnabled);
  return opening || a.requireFollow ? "steps" : "direct";
}

/** "With steps first" needs at least one step on. */
export function stepsMissing(a: { type: AutomationKind; mode: DeliveryMode; openingDmEnabled: boolean; requireFollow: boolean }): boolean {
  if (a.mode !== "steps") return false;
  return !(a.type === "COMMENTS" && a.openingDmEnabled) && !a.requireFollow;
}

export type SequenceItem =
  | { kind: "wait"; seconds: number }
  | { kind: "publicReply" }
  | { kind: "opening" | "follow" | "main"; firstDm: boolean }
  | { kind: "followUp"; minutes: number };

/**
 * What the person receives, in order. The wait comes first: everything after
 * it, the public reply on a comment included, goes once it is over.
 */
export function deliverySequence(a: {
  type: AutomationKind;
  publicReply: boolean;
  openingDm: boolean;
  requireFollow: boolean;
  delaySeconds: number;
  followUp: boolean;
  followUpMinutes: number;
}): SequenceItem[] {
  const items: SequenceItem[] = [];
  if (a.delaySeconds > 0) items.push({ kind: "wait", seconds: a.delaySeconds });
  const comments = a.type === "COMMENTS";
  if (comments && a.publicReply) items.push({ kind: "publicReply" });
  const dms: Array<"opening" | "follow" | "main"> = [];
  if (comments && a.openingDm) dms.push("opening");
  if (a.requireFollow) dms.push("follow");
  dms.push("main");
  dms.forEach((kind, i) => items.push({ kind, firstDm: i === 0 }));
  if (a.followUp) items.push({ kind: "followUp", minutes: a.followUpMinutes });
  return items;
}

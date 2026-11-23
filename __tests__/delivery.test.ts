/**
 * Step 3, "What the person receives": "Direct" or "With steps first", the
 * wait before answering, and the order shown live above the cards.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_DM_DELAY_SECONDS, deliveryModeOf, deliverySequence, DM_DELAY_OPTIONS, stepsMissing } from "@/lib/automation/delivery";

describe("which mode an automation opens on (what it has saved)", () => {
  it("no opening DM and no follow request: Direct", () => {
    expect(deliveryModeOf({ type: "COMMENTS", openingDmEnabled: false, requireFollow: false })).toBe("direct");
    expect(deliveryModeOf({ type: "DIRECT", openingDmEnabled: null, requireFollow: null })).toBe("direct");
  });

  it("an opening DM (Comments) or a follow request: With steps first", () => {
    expect(deliveryModeOf({ type: "COMMENTS", openingDmEnabled: true, requireFollow: false })).toBe("steps");
    expect(deliveryModeOf({ type: "COMMENTS", openingDmEnabled: false, requireFollow: true })).toBe("steps");
    expect(deliveryModeOf({ type: "STORIES", openingDmEnabled: false, requireFollow: true })).toBe("steps");
    // An opening DM flag left on a Stories/Direct row does nothing there.
    expect(deliveryModeOf({ type: "DIRECT", openingDmEnabled: true, requireFollow: false })).toBe("direct");
  });
});

describe("“With steps first” needs a step", () => {
  it("both off is missing; Direct never is", () => {
    expect(stepsMissing({ type: "COMMENTS", mode: "steps", openingDmEnabled: false, requireFollow: false })).toBe(true);
    expect(stepsMissing({ type: "COMMENTS", mode: "steps", openingDmEnabled: true, requireFollow: false })).toBe(false);
    expect(stepsMissing({ type: "DIRECT", mode: "steps", openingDmEnabled: true, requireFollow: false })).toBe(true);
    expect(stepsMissing({ type: "COMMENTS", mode: "direct", openingDmEnabled: false, requireFollow: false })).toBe(false);
  });
});

describe("the order the person receives things in", () => {
  const base = { type: "COMMENTS" as "COMMENTS" | "STORIES" | "DIRECT", publicReply: false, openingDm: false, requireFollow: false, delaySeconds: 0, followUp: false, followUpMinutes: 0 };
  const kinds = (a: Partial<typeof base>) => deliverySequence({ ...base, ...a }).map((i) => i.kind);

  it("Comments with a wait: the wait, then the public reply, then the DM", () => {
    const items = deliverySequence({ ...base, publicReply: true, delaySeconds: 30 });
    expect(items).toEqual([{ kind: "wait", seconds: 30 }, { kind: "publicReply" }, { kind: "main", firstDm: true }]);
  });

  it("without a wait, nothing before the public reply", () => {
    expect(kinds({ publicReply: true })).toEqual(["publicReply", "main"]);
  });

  it("steps: the wait → opening DM → follow request → main message", () => {
    const items = deliverySequence({ ...base, openingDm: true, requireFollow: true, delaySeconds: 60 });
    expect(items).toEqual([
      { kind: "wait", seconds: 60 },
      { kind: "opening", firstDm: true },
      { kind: "follow", firstDm: false },
      { kind: "main", firstDm: false },
    ]);
    expect(kinds({ requireFollow: true })).toEqual(["follow", "main"]);
  });

  it("Stories and Direct: the wait, then the DM", () => {
    expect(kinds({ type: "DIRECT", delaySeconds: 300 })).toEqual(["wait", "main"]);
  });

  it("the thank-you comes last; Stories/Direct have no public reply or opening DM", () => {
    expect(kinds({ followUp: true, followUpMinutes: 10 })).toEqual(["main", "followUp"]);
    expect(kinds({ type: "DIRECT", publicReply: true, openingDm: true })).toEqual(["main"]);
  });

  it("the waits the editor offers; new automations start at 30 seconds", () => {
    expect(DM_DELAY_OPTIONS).toEqual([0, 30, 60, 300]);
    expect(DEFAULT_DM_DELAY_SECONDS).toBe(30);
  });
});

/**
 * Webhook receipts: what each signed POST carried (object, entry ids, keys,
 * fields, kinds of messaging items) and whether each entry was accepted or
 * discarded, never message text or the ids of people; and the admin's report
 * (did messages arrive? which ids were discarded? proposed mapping).
 */
import { describe, expect, it } from "vitest";
import { describeWebhook } from "@/lib/webhooks/receipts";
import { buildReceiptsReport, type AccountRow } from "@/lib/webhooks/receipts-report";

const KNOWN = new Set(["17841400000000001"]);
const PERSON = "998877665544";

const message = (entryId: string, recipient = entryId) => ({
  object: "instagram",
  entry: [{ id: entryId, time: 1, messaging: [{ sender: { id: PERSON }, recipient: { id: recipient }, timestamp: 1, message: { mid: "m1", text: "quero o PREÇO secreto" } }] }],
});

describe("describeWebhook", () => {
  it("a message for a connected account: accepted, kinds counted, no text and no person id kept", () => {
    const summary = describeWebhook(message("17841400000000001"), KNOWN);
    expect(summary).toEqual({
      object: "instagram",
      accepted: true,
      reason: null,
      entries: [{ id: "17841400000000001", keys: ["id", "messaging", "time"], fields: [], messaging: { message: 1 }, standby: {}, otherBusinessIds: [], accepted: true, reason: null }],
    });
    const json = JSON.stringify(summary);
    expect(json).not.toContain("PREÇO");
    expect(json).not.toContain(PERSON);
    expect(json).not.toContain("m1");
  });

  it("an echo, a button tap, a read and standby are told apart; a different business id inside is kept as evidence", () => {
    const summary = describeWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "555",
            time: 1,
            messaging: [
              { sender: { id: "17841400000000001" }, recipient: { id: PERSON }, message: { mid: "e1", is_echo: true, text: "x" } },
              { sender: { id: PERSON }, recipient: { id: "17841400000000001" }, postback: { payload: "reveal:a" } },
              { sender: { id: PERSON }, recipient: { id: "17841400000000001" }, read: { mid: "e1" } },
            ],
            standby: [{ sender: { id: PERSON }, recipient: { id: "555" }, message: { mid: "s1", text: "oi" } }],
          },
        ],
      },
      KNOWN
    );
    expect(summary.entries[0]).toMatchObject({
      id: "555",
      keys: ["id", "messaging", "standby", "time"],
      messaging: { echo: 1, postback: 1, read: 1 },
      standby: { message: 1 },
      otherBusinessIds: ["17841400000000001"],
      accepted: false,
      reason: "unknown_account",
    });
    expect(JSON.stringify(summary)).not.toContain(PERSON);
  });

  it("comments (changes) for an unknown account; another object; an invalid body", () => {
    expect(describeWebhook({ object: "instagram", entry: [{ id: "999", time: 1, changes: [{ field: "comments", value: { text: "LINK" } }] }] }, KNOWN)).toMatchObject({
      accepted: false,
      reason: null,
      entries: [{ id: "999", fields: ["comments"], reason: "unknown_account", accepted: false }],
    });
    expect(describeWebhook({ object: "page", entry: [{ id: "1234", messaging: [] }] }, KNOWN)).toMatchObject({
      object: "page",
      accepted: false,
      reason: "object_not_instagram",
      entries: [{ id: "1234", reason: "object_not_instagram" }],
    });
    expect(describeWebhook("not an object", KNOWN)).toEqual({ object: null, accepted: false, reason: "invalid_json", entries: [] });
    expect(describeWebhook({ object: "instagram", entry: [] }, KNOWN).reason).toBe("no_entries");
  });
});

describe("buildReceiptsReport", () => {
  const accounts: AccountRow[] = [{ username: "primus3d_", instagramId: "17841400000000001", instagramScopedId: "IGSCOPED1", metaLoginUserId: "122000000000777", client: "Primus" }];
  const row = (payload: unknown, at: string, known = KNOWN) => {
    const s = describeWebhook(payload, known);
    return { id: at, createdAt: new Date(at), object: s.object, accepted: s.accepted, reason: s.reason, entries: s.entries };
  };
  const comment = (id: string) => ({ object: "instagram", entry: [{ id, time: 1, changes: [{ field: "comments", value: {} }] }] });

  it("only comments arrived: Meta sent no message (the app discarded none)", () => {
    const report = buildReceiptsReport([row(comment("17841400000000001"), "2026-11-23T10:00:00Z")], accounts);
    expect(report).toMatchObject({ total: 1, accepted: 1, discarded: 0, messages: "none", arrived: { fields: { comments: 1 }, messaging: {} } });
  });

  it("messages accepted", () => {
    expect(buildReceiptsReport([row(message("17841400000000001"), "2026-11-23T10:00:00Z")], accounts).messages).toBe("accepted");
  });

  it("messages arriving under another id: discarded, shown with a proposed mapping, nothing changed", () => {
    const report = buildReceiptsReport(
      [
        row(message("555", "17841400000000001"), "2026-11-23T10:05:00Z"),
        row(message("555", "17841400000000001"), "2026-11-23T10:00:00Z"),
        row(message("IGSCOPED1"), "2026-11-23T09:00:00Z"),
        row(message("777"), "2026-11-23T08:00:00Z"),
        row(comment("17841400000000001"), "2026-11-23T07:00:00Z"),
      ],
      accounts
    );
    expect(report.messages).toBe("discarded_only");
    expect(report.discardedBy).toEqual({ unknown_account: 4 });
    expect(report.unknown.map((u) => [u.id, u.count, u.proposal?.why ?? null])).toEqual([
      ["555", 2, "business_id_inside"],
      ["IGSCOPED1", 1, "app_scoped_id"],
      ["777", 1, null],
    ]);
    expect(report.unknown[0]).toMatchObject({
      messaging: { message: 2 },
      otherBusinessIds: ["17841400000000001"],
      proposal: { username: "primus3d_", instagramId: "17841400000000001", client: "Primus" },
      firstAt: new Date("2026-11-23T10:00:00Z"),
      lastAt: new Date("2026-11-23T10:05:00Z"),
    });
  });
});

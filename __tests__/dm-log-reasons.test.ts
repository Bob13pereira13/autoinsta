/**
 * DM Logs: no reason shown to the client stays in English. Every reason the
 * worker writes today, every one earlier versions wrote (rows still in the
 * database), and the errors Instagram returns go through the real formatting
 * (Meta client → worker's log text) and come out of logReasonText() in
 * Portuguese.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "@/lib/i18n";
import ptBR from "@/lib/i18n/pt-BR.json";
import { describeLogReason, LOG_REASONS, logReasonText } from "@/lib/dm-logs/reasons";
import { formatErrorForLog } from "@/lib/dm-logs/format-error";
import { classifySendError } from "@/lib/instagram/delivery-errors";
import { RateLimitError, sendPrivateReply, TokenExpiredError } from "@/lib/meta/client";
import { ZernioApiError, ZernioDeliveryUnconfirmedError } from "@/lib/zernio/client";

const pt = createI18n("pt-BR");
const en = createI18n("en");
const root = path.join(__dirname, "..");

// Words that only show up when English leaks through ("Instagram", "DM",
// "Direct", "HTTP" and "spam" stay; "a" and "no" are Portuguese too).
const ENGLISH = new Set(
  ("the an not sent limit reached failed error account access token available someone answered person during wait " +
    "comment deleted hidden media hourly monthly retry scheduled another campaign already reply private allows this within " +
    "interval request delivery unconfirmed inspect inbox before retrying unknown permission window message messages user " +
    "object does exist rate too many calls temporarily blocked refused provider send of for to with is was has been while " +
    "fully only one could decrypt failed found right now when your you outside allowed can cannot yes")
    .split(" ")
);
function englishWords(text: string): string[] {
  return (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => ENGLISH.has(w));
}
function expectPortuguese(stored: string) {
  const shown = logReasonText(stored, pt.t);
  expect(shown, stored).not.toBe("");
  expect(englishWords(shown), `${stored}\n→ ${shown}`).toEqual([]);
  // Raw stored text never reaches the screen, except plain values (a name, a number).
  expect(shown).not.toContain(stored);
  return shown;
}

describe("reasons the worker writes now", () => {
  const current = [
    LOG_REASONS.noToken,
    LOG_REASONS.tokenUnreadable,
    LOG_REASONS.monthlyLimit(500),
    LOG_REASONS.hourlyLimit,
    LOG_REASONS.hourlyLimitRetry,
    LOG_REASONS.privateReplyUsed("Catálogo de verão"),
    LOG_REASONS.privateReplyUsed(null),
    LOG_REASONS.teamAnsweredDuringWait,
    LOG_REASONS.teamAnsweredReplyWaiting,
    LOG_REASONS.teamTalkedRecently,
    LOG_REASONS.cooldown,
    LOG_REASONS.commentDeleted,
    LOG_REASONS.commentHidden,
    LOG_REASONS.mediaHourlyLimit,
    LOG_REASONS.mediaPartial(1, 3, "PermissionError 10: (#10) Not allowed (/v25.0/ig/messages) [code=10 sub=- type=OAuthException trace=x]"),
  ];
  it.each(current)("“%s” is shown in Portuguese", (stored) => {
    expectPortuguese(stored);
  });

  it("keeps the values that matter: the limit and the other automation's name", () => {
    expect(logReasonText(LOG_REASONS.monthlyLimit(500), pt.t)).toBe("Limite mensal de DMs atingido (500)");
    expect(logReasonText(LOG_REASONS.privateReplyUsed("Catálogo"), pt.t)).toBe(
      "Não enviada: a automação “Catálogo” já mandou a única resposta privada que o Instagram permite para este comentário"
    );
    expect(logReasonText(LOG_REASONS.mediaPartial(2, 5, "fetch failed"), pt.t)).toBe("Mídia enviada só em parte (2 de 5 falharam).");
  });

  it("an English workspace reads them in English (the catalog's source), never empty", () => {
    for (const stored of current) expect(logReasonText(stored, en.t)).not.toBe("");
    expect(logReasonText(LOG_REASONS.hourlyLimitRetry, en.t)).toBe("Hourly send limit reached; it will be tried again automatically");
  });
});

describe("rows written by earlier versions", () => {
  // Every text earlier versions stored (from the repository's history).
  it("Meta's text without a subcode (earlier versions) still names the case", () => {
    expect(logReasonText("MetaApiError 100: (#100) The comment is invalid for a private reply", pt.t)).toMatch(/não aceita resposta privada/);
    expect(logReasonText("MetaApiError 10: (#10) This message is sent outside of allowed window.", pt.t)).toMatch(/passou o prazo permitido/);
    expect(logReasonText("PermissionError 100: Unsupported get request. Object with ID 'c1' does not exist", pt.t)).toMatch(/não existe mais/);
  });

  it.each([
    "Not sent: someone from the account answered this person while the DM was waiting",
    "Monthly DM limit reached (1000)",
    "Another campaign (unknown) already sent the one private reply Instagram allows for this comment",
    "MetaApiError 100: (#100) The comment is invalid for a private reply",
    "MetaApiError 1: An unknown error occurred",
    "MetaApiError 10: (#10) This message is sent outside of allowed window.",
    "MetaApiError 551: This person isn't available right now.",
    "TokenExpiredError 190: Error validating access token: Session has expired",
    "RateLimitError 4: Application request limit reached",
    "ZernioApiError 502: Zernio request failed (HTTP 502)",
    "ZernioDeliveryUnconfirmedError 502: Message delivery is unconfirmed. Inspect the Instagram inbox before retrying.",
    "Unknown error",
  ])("“%s”", (stored) => {
    expectPortuguese(stored);
  });
});

describe("Instagram's errors, through the real Meta client and the worker's log text", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  async function storedFor(body: unknown, status = 400): Promise<{ raw: string; classified: string }> {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    const error = await sendPrivateReply({ accessToken: "t" }, "ig1", "c1", "Oi").then(
      () => { throw new Error("expected a failure"); },
      (e: unknown) => e
    );
    // The worker stores a send failure after classifySendError (an uncertain
    // outcome becomes "delivery unconfirmed"); other paths store it directly.
    return { raw: formatErrorForLog(error), classified: formatErrorForLog(classifySendError(error)) };
  }
  const meta = (code: number, sub: number | undefined, message: string) => ({
    error: { message, type: "OAuthException", code, ...(sub ? { error_subcode: sub } : {}), fbtrace_id: "trace" },
  });

  it.each([
    [10, 2534022, "(#10) This message is sent outside of allowed window.", "passou o prazo permitido"],
    [100, 2534025, "(#100) The comment is invalid for a private reply", "não aceita resposta privada"],
    [100, 33, "Unsupported post request. Object with ID 'c1' does not exist", "não existe mais"],
    [100, 2534014, "No matching user found", "não encontrou esta pessoa"],
    [551, 1545041, "This person isn't available right now.", "não pode receber mensagens"],
    [190, 463, "Error validating access token: Session has expired", "Reconecte a conta em Contas"],
    [4, undefined, "Application request limit reached", "limitou temporariamente"],
    [17, undefined, "User request limit reached", "limitou temporariamente"],
    [613, undefined, "Calls to this api have exceeded the rate limit.", "limitou temporariamente"],
    [368, 1390008, "The action attempted has been deemed abusive or is otherwise disallowed", "bloqueou esta ação"],
    [10, undefined, "(#10) Application does not have permission for this action", "negou a permissão"],
    [200, undefined, "(#200) Requires instagram_manage_messages permission", "negou a permissão"],
    [100, 9999, "(#100) Invalid parameter", "código 100, subcódigo 9999"],
    [9007, undefined, "Some new error Meta invents", "código 9007"],
  ])("code %i sub %s → Portuguese", async (code, sub, message, expected) => {
    const { raw, classified } = await storedFor(meta(code, sub, message));
    expect(expectPortuguese(raw)).toContain(expected);
    expectPortuguese(classified);
  });

  it("an uncertain outcome (Meta code 1 or 2, a 500, a dropped connection): delivery not confirmed", async () => {
    for (const body of [meta(1, undefined, "An unknown error occurred"), meta(2, undefined, "Service temporarily unavailable")]) {
      const { raw, classified } = await storedFor(body);
      expect(expectPortuguese(raw)).toBe("Erro temporário do Instagram.");
      expect(expectPortuguese(classified)).toMatch(/^O Instagram não confirmou a entrega/);
    }
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const error = await sendPrivateReply({ accessToken: "t" }, "ig1", "c1", "Oi").catch((e: unknown) => e);
    expect(expectPortuguese(formatErrorForLog(classifySendError(error)))).toMatch(/^O Instagram não confirmou a entrega/);
    expect(expectPortuguese(formatErrorForLog(error))).toBe("Erro inesperado no envio.");
  });

  it("connection-provider errors and anything unexpected", () => {
    for (const error of [
      new ZernioApiError(503),
      new ZernioDeliveryUnconfirmedError(),
      new RateLimitError("Zernio request failed (HTTP 429)"),
      new TokenExpiredError("Zernio request failed (HTTP 401)"),
      new Error("Connected Instagram account is unavailable in Zernio"),
      new Error("Media messages are only supported on the official Meta API"),
      "a thrown string",
    ]) {
      expectPortuguese(formatErrorForLog(error));
    }
  });
});

describe("one place for the reasons", () => {
  const worker = readFileSync(path.join(root, "lib/queue/dm-worker.ts"), "utf8");

  it("the worker writes no reason of its own: only LOG_REASONS or a formatted error", () => {
    const writes = [...worker.matchAll(/errorMessage:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    // "string": the type of a helper's parameter.
    const allowed = /^(LOG_REASONS\.|formatError\(|null$|mediaNote$|errorMessage$|string\b)/;
    expect(writes.filter((w) => !allowed.test(w))).toEqual([]);
    // No reason-like literal anywhere in the worker (e.g. passed to a helper).
    expect(worker.match(/["`](Not sent|Media not|Monthly DM|Hourly|Another campaign|No Instagram|Failed to decrypt)[^"`]*["`]/g)).toBeNull();
  });

  it("the logs page and the admin's diagnostics show reasons only through logReasonText", () => {
    const logs = readFileSync(path.join(root, "app/(dashboard)/logs/page.tsx"), "utf8");
    expect(logs).toContain("logReasonText(log.errorMessage, t)");
    expect(logs).not.toMatch(/\{\s*(message\()?log\.errorMessage\)?\s*\}/);
    const diagnostics = readFileSync(path.join(root, "app/admin/diagnostics/page.tsx"), "utf8");
    expect(diagnostics).toContain("logReasonText(item.errorMessage, t)");
  });

  it("every reason's message has a Portuguese translation", () => {
    const stored = [...Object.values(LOG_REASONS).map((r) => (typeof r === "function" ? (r as (...a: never[]) => string)(...([1, 2, "x"] as never[])) : r))];
    for (const s of stored) {
      const reason = describeLogReason(s)!;
      expect(Object.hasOwn(ptBR, reason.key), reason.key).toBe(true);
    }
  });
});

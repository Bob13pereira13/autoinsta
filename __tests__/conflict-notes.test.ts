/**
 * Overlaps between automations, as the owner reads them (editor, save dialog,
 * automations list): a normal combination is a neutral information note on
 * both sides, without "conflict" and without "change the keyword or pause";
 * only the cases where one of the two stops answering stay as warnings. Same
 * words in English.
 */
import { describe, expect, it } from "vitest";
import { createI18n } from "@/lib/i18n";
import { byKind, findConflicts, type Conflict, type ConflictCandidate } from "@/lib/automation/conflicts";
import { channelOfType, keywordList, overlapText, overlapTone, splitTag } from "@/lib/automation/conflict-text";

const pt = createI18n("pt-BR");
const en = createI18n("en");

let seq = 0;
function auto(over: Partial<ConflictCandidate> = {}): ConflictCandidate {
  seq += 1;
  return {
    id: `a${seq}`,
    name: `Automação ${seq}`,
    type: "COMMENTS",
    createdAt: new Date(2026, 0, seq),
    isActive: true,
    instagramAccountId: "acc1",
    keywords: ["link"],
    matchAnyWord: false,
    wholeWordMatch: true,
    matchAnyPost: true,
    pendingNextReel: false,
    postIds: [],
    triggerStoryReplies: true,
    triggerStoryMentions: false,
    ...over,
  };
}
const any = (over: Partial<ConflictCandidate> = {}) => auto({ matchAnyWord: true, keywords: [], ...over });

/** The overlap of `self` with `other` (exactly one). */
function overlap(self: ConflictCandidate, other: ConflictCandidate): Conflict {
  const list = findConflicts(self, [other]);
  expect(list).toHaveLength(1);
  return list[0];
}

const WARNING_WORDS = { pt: /Conflito|Troque|pause|não vai responder/i, en: /Conflict|Change the keyword|pause|won't answer/i };

/** Both sides get a neutral information note, in both languages. */
function expectSplitBothSides(a: ConflictCandidate, b: ConflictCandidate) {
  const sides = [overlap(a, b), overlap(b, a)];
  expect(sides.map((c) => c.kind)).toEqual(["split", "split"]);
  // One takes its part, the other answers the rest.
  expect(sides.map((c) => c.winner).sort()).toEqual(["other", "this"]);
  for (const c of sides) {
    expect(c.never).toBe(false);
    expect(overlapTone(c)).toBe("info");
    expect(overlapText(c, pt)).not.toMatch(WARNING_WORDS.pt);
    expect(overlapText(c, en)).not.toMatch(WARNING_WORDS.en);
  }
  return sides.map((c) => ({ pt: overlapText(c, pt), en: overlapText(c, en) }));
}

/** Still a warning (yellow, or red when one answers nothing at all), with what to do. */
function expectWarning(a: ConflictCandidate, b: ConflictCandidate) {
  const sides = [overlap(a, b), overlap(b, a)];
  for (const c of sides) {
    expect(c.kind).toBe("conflict");
    expect(["warning", "danger"]).toContain(overlapTone(c));
    expect(overlapText(c, pt)).toMatch(/Troque a palavra-chave ou pause uma das duas/);
    expect(overlapText(c, en)).toMatch(/Change the keyword or pause one of them/);
  }
  // `a` (created first) is the older: it answers; `b` loses what both catch.
  expect(sides.map((c) => c.winner)).toEqual(["this", "other"]);
  return sides;
}

describe("item 1: normal combinations are information, on both sides", () => {
  it("Comments: one with a keyword and one without, on the same posts (the user's example)", () => {
    const direct = any({ name: "Teste 1 - comentario direto" });
    const access = auto({ name: "Acesso", keywords: ["acesso"] });
    const [mine, theirs] = expectSplitBothSides(access, direct);
    expect(mine.pt).toBe("Comentários com “acesso” vão para esta automação. Os outros continuam com “Teste 1 - comentario direto”.");
    expect(theirs.pt).toBe("Comentários com “acesso” vão para “Acesso”; esta responde os outros.");
    expect(mine.en).toBe("Comments with “acesso” go to this automation. The others still go to “Teste 1 - comentario direto”.");
    expect(theirs.en).toBe("Comments with “acesso” go to “Acesso”; this one answers the others.");

    // Also on the same marked posts, and whichever is older.
    expectSplitBothSides(any({ matchAnyPost: false, postIds: ["p1"] }), auto({ matchAnyPost: false, postIds: ["p1"] }));
    expectSplitBothSides(auto(), any());
  });

  it("every keyword that decides is named, not just the first", () => {
    const [mine] = expectSplitBothSides(auto({ keywords: ["acesso", "link"] }), any({ name: "Geral" }));
    expect(mine.pt).toBe("Comentários com “acesso” ou “link” vão para esta automação. Os outros continuam com “Geral”.");
    expect(mine.en).toBe("Comments with “acesso” or “link” go to this automation. The others still go to “Geral”.");
    const [many] = expectSplitBothSides(auto({ keywords: ["a1", "b2", "c3", "d4", "e5"] }), any());
    expect(many.pt).toContain("“a1”, “b2”, “c3” ou outras 2 palavras-chave");
    expect(keywordList(["a1", "b2", "c3", "d4"], en)).toBe("“a1”, “b2”, “c3”, or 1 other keyword");
  });

  it("Comments: one on specific posts and one on all posts", () => {
    const all = auto({ name: "Todas" });
    const specific = auto({ name: "Lançamento", matchAnyPost: false, postIds: ["p1"] });
    const [mine, theirs] = expectSplitBothSides(specific, all);
    expect(mine.pt).toBe("Nas publicações marcadas aqui, comentários com “link” vão para esta automação. Os outros continuam com “Todas”.");
    expect(theirs.pt).toBe("Nas publicações marcadas em “Lançamento”, comentários com “link” vão para “Lançamento”; esta responde os outros.");
    expect(theirs.en).toBe("On the posts checked in “Lançamento”, comments with “link” go to “Lançamento”; this one answers the others.");

    // Both without keywords.
    const [anyMine, anyTheirs] = expectSplitBothSides(any({ matchAnyPost: false, postIds: ["p1"] }), any({ name: "Geral" }));
    expect(anyMine.pt).toBe("Nas publicações marcadas aqui, os comentários vão para esta automação. Nas outras publicações, continuam com “Geral”.");
    expect(anyTheirs.en).toMatch(/^On the posts checked in “.+”, comments go to “.+”; this one answers on the other posts\.$/);

    // The next reel is a specific post too.
    const [reel] = expectSplitBothSides(auto({ matchAnyPost: false, pendingNextReel: true }), auto({ name: "Todas" }));
    expect(reel.pt).toBe("No próximo reel, comentários com “link” vão para esta automação. Os outros continuam com “Todas”.");
  });

  it("Stories: story replies with a keyword and without", () => {
    const story = (over: Partial<ConflictCandidate>) => auto({ type: "STORIES", matchAnyPost: false, ...over });
    const [mine, theirs] = expectSplitBothSides(story({ keywords: ["preço"], name: "Preço" }), story({ matchAnyWord: true, keywords: [], name: "Geral" }));
    expect(mine.pt).toBe("Respostas aos stories com “preço” vão para esta automação. As outras continuam com “Geral”.");
    expect(theirs.pt).toBe("Respostas aos stories com “preço” vão para “Preço”; esta responde as outras.");
    expect(theirs.en).toBe("Story replies with “preço” go to “Preço”; this one answers the others.");
  });

  it("Direct: messages with a keyword and without", () => {
    const direct = (over: Partial<ConflictCandidate>) => auto({ type: "DIRECT", matchAnyPost: false, ...over });
    const [mine, theirs] = expectSplitBothSides(direct({ keywords: ["horário"], name: "Horário" }), direct({ matchAnyWord: true, keywords: [], name: "Geral" }));
    expect(mine.pt).toBe("Mensagens com “horário” vão para esta automação. As outras continuam com “Geral”.");
    expect(theirs.en).toBe("Messages with “horário” go to “Horário”; this one answers the others.");
  });

  it("the automations list tags it neutral, not as a conflict", () => {
    const all = [any({ name: "Geral" }), auto({ name: "Acesso", keywords: ["acesso"] })];
    for (const self of all) {
      const { conflicts, splits } = byKind(findConflicts(self, all));
      expect(conflicts).toEqual([]);
      expect(splits).toHaveLength(1);
    }
    const splits = byKind(findConflicts(all[0], all)).splits;
    expect(splitTag(channelOfType("COMMENTS"), splits, pt)).toBe("Divide os comentários com “Acesso”");
    expect(splitTag(channelOfType("DIRECT"), [...splits, ...splits], en)).toBe("Shares messages with 2 automations");
  });
});

describe("item 2: one of them stops answering → still a warning", () => {
  it("two without keywords on the same posts", () => {
    expectWarning(any(), any());
    expectWarning(any({ matchAnyPost: false, postIds: ["p1"] }), any({ matchAnyPost: false, postIds: ["p1"] }));
    expectWarning(any({ matchAnyPost: false, pendingNextReel: true }), any({ matchAnyPost: false, pendingNextReel: true }));
    // The newer one answers nothing at all: red.
    expect(overlapTone(overlap(any(), any()))).toBe("warning");
    const older = any();
    expect(overlapTone(overlap(any(), older))).toBe("danger");
  });

  it("the same keyword on the same posts", () => {
    const [, newer] = expectWarning(auto({ name: "Catálogo" }), auto({ keywords: ["LINK"] }));
    expect(overlapText(newer, pt)).toBe(
      "Esta automação não vai responder nada: “Catálogo” pega tudo o que ela responderia (comentários com “LINK” em todas as publicações), porque é mais antiga. Troque a palavra-chave ou pause uma das duas."
    );
    expectWarning(auto({ matchAnyPost: false, postIds: ["p1"] }), auto({ matchAnyPost: false, postIds: ["p1", "p2"] }));
  });

  it("a tie where only the older answers (some words in common)", () => {
    const sides = expectWarning(auto({ keywords: ["link", "preço"] }), auto({ keywords: ["link", "cupom"] }));
    // The newer one still answers “cupom”: a warning, not red.
    expect(overlapTone(sides[0])).toBe("warning");
    expect(overlapTone(sides[1])).toBe("warning");
    expect(sides[1].keywords).toEqual(["link"]);
  });

  it("Stories and Direct: two without keywords, or the same keyword", () => {
    const story = (over: Partial<ConflictCandidate> = {}) => auto({ type: "STORIES", matchAnyPost: false, ...over });
    const direct = (over: Partial<ConflictCandidate> = {}) => auto({ type: "DIRECT", matchAnyPost: false, ...over });
    expectWarning(story({ matchAnyWord: true, keywords: [] }), story({ matchAnyWord: true, keywords: [] }));
    expectWarning(story(), story());
    expectWarning(direct({ matchAnyWord: true, keywords: [] }), direct({ matchAnyWord: true, keywords: [] }));
    expectWarning(direct({ keywords: ["preço"] }), direct({ keywords: ["PRECO"] }));
  });

  it("the automations list keeps the warning", () => {
    const all = [auto({ name: "A" }), auto({ name: "B" })];
    for (const self of all) {
      const { conflicts, splits } = byKind(findConflicts(self, all));
      expect(conflicts).toHaveLength(1);
      expect(splits).toEqual([]);
    }
  });
});

describe("older answers without a kind (saved before this version)", () => {
  it("only age makes a conflict", () => {
    const c = overlap(auto(), any());
    const legacy = { ...c, kind: undefined } as unknown as Conflict;
    expect(overlapTone(legacy)).toBe("info");
    const old = overlap(auto(), auto());
    expect(overlapTone({ ...old, kind: undefined } as unknown as Conflict)).not.toBe("info");
  });
});

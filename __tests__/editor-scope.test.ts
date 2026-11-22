/**
 * Automation editor, step "When" and the choice cards: which option an
 * automation opens on, when the post grid shows, what is saved for each option
 * and when saving is blocked; Stories needs at least one trigger; the cards are
 * native radios/checkboxes so the keyboard works (arrows inside a radiogroup).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  postScopeBlocked,
  postScopeOf,
  postScopePayload,
  showsPostGrid,
  storyTriggerProblem,
  summaryScopeOf,
  type PostScope,
} from "@/lib/automation/editor-scope";
import { automationRuleIssues, RULE_MESSAGES } from "@/lib/automation/rules";
import { CheckCards, RadioCards } from "@/components/ui/choice-cards";

const marks = [
  { id: "p1", url: "https://instagram.com/p/1", publishedAt: "2026-11-01T10:00:00Z" },
  { id: "p2", url: null, publishedAt: null },
];

describe("which option an automation opens on", () => {
  it("all posts: matchAnyPost without posts", () => {
    expect(postScopeOf({ matchAnyPost: true, posts: [] })).toEqual({ scope: "all", posts: [] });
  });

  it("specific posts: its list of posts, checked", () => {
    expect(
      postScopeOf({
        matchAnyPost: false,
        posts: [
          { postId: "p1", postUrl: "https://instagram.com/p/1", publishedAt: "2026-11-01T10:00:00Z" },
          { postId: "p2", postUrl: null, publishedAt: null },
        ],
      })
    ).toEqual({ scope: "posts", posts: marks });
  });

  it("next post or reel: pendingNextReel", () => {
    expect(postScopeOf({ pendingNextReel: true, matchAnyPost: false, posts: [] })).toEqual({ scope: "next", posts: [] });
  });

  it("a next-reel automation already bound to its reel opens on specific posts with the reel checked", () => {
    // What attach-next-reel leaves: flags off, the reel as the marked post.
    const bound = {
      pendingNextReel: false,
      matchAnyPost: false,
      postId: "reel9",
      postUrl: "https://instagram.com/reel/9",
      posts: [{ postId: "reel9", postUrl: "https://instagram.com/reel/9", publishedAt: "2026-11-12T00:00:00Z" }],
    };
    expect(postScopeOf(bound)).toEqual({
      scope: "posts",
      posts: [{ id: "reel9", url: "https://instagram.com/reel/9", publishedAt: "2026-11-12T00:00:00Z" }],
    });
  });

  it("legacy single postId opens on specific posts; marked posts win over the all-posts flag", () => {
    expect(postScopeOf({ postId: "solo", postUrl: null, matchAnyPost: false })).toEqual({
      scope: "posts",
      posts: [{ id: "solo", url: null }],
    });
    expect(postScopeOf({ matchAnyPost: true, posts: [{ postId: "p1", postUrl: null, publishedAt: null }] }).scope).toBe("posts");
    // A stale postId next to the all-posts flag does not count.
    expect(postScopeOf({ matchAnyPost: true, postId: "old" })).toEqual({ scope: "all", posts: [] });
  });

  it("no option stored opens on specific posts with nothing checked (saving asks for a post)", () => {
    const stored = postScopeOf({ matchAnyPost: false, pendingNextReel: false, posts: [] });
    expect(stored).toEqual({ scope: "posts", posts: [] });
    expect(postScopeBlocked(stored.scope, stored.posts)).toBe(true);
  });
});

describe("the post grid", () => {
  it("only shows with specific posts", () => {
    expect(showsPostGrid("posts")).toBe(true);
    expect(showsPostGrid("all")).toBe(false);
    expect(showsPostGrid("next")).toBe(false);
  });
});

describe("saving", () => {
  it("specific posts with nothing checked is blocked", () => {
    expect(postScopeBlocked("posts", [])).toBe(true);
    expect(postScopeBlocked("posts", marks.slice(0, 1))).toBe(false);
    expect(postScopeBlocked("all", [])).toBe(false);
    expect(postScopeBlocked("next", [])).toBe(false);
  });

  it("switching to another option does not save the checked posts", () => {
    expect(postScopePayload("all", marks)).toEqual({ posts: [], matchAnyPost: true, pendingNextReel: false });
    expect(postScopePayload("next", marks)).toEqual({ posts: [], matchAnyPost: false, pendingNextReel: true });
    expect(postScopePayload("posts", marks)).toEqual({ posts: marks, matchAnyPost: false, pendingNextReel: false });
  });

  it("each option the editor can save passes the server rules", () => {
    const save = (scope: PostScope, posts: typeof marks) => {
      const payload = postScopePayload(scope, posts);
      return automationRuleIssues({
        type: "COMMENTS",
        matchAnyPost: payload.matchAnyPost,
        pendingNextReel: payload.pendingNextReel,
        postIds: payload.posts.map((p) => p.id),
        matchAnyWord: true,
      });
    };
    for (const scope of ["all", "next"] as const) expect(save(scope, [])).toEqual([]);
    expect(save("posts", marks)).toEqual([]);
    // What the editor blocks, the server refuses too.
    expect(save("posts", [])).toEqual([{ path: "postId", message: RULE_MESSAGES.postScope }]);
  });

  it("the summary names the same scope", () => {
    expect(summaryScopeOf("all")).toBe("any");
    expect(summaryScopeOf("posts")).toBe("specific");
    expect(summaryScopeOf("next")).toBe("next");
  });
});

describe("Stories triggers (checkboxes)", () => {
  it("needs at least one checked", () => {
    expect(storyTriggerProblem({ replies: false, mentions: false, anyReply: true })).toBe("none");
    expect(storyTriggerProblem({ replies: false, mentions: false, anyReply: false })).toBe("none");
  });

  it("replies, mentions or both", () => {
    expect(storyTriggerProblem({ replies: true, mentions: false, anyReply: false })).toBeNull();
    expect(storyTriggerProblem({ replies: false, mentions: true, anyReply: true })).toBeNull();
    expect(storyTriggerProblem({ replies: true, mentions: true, anyReply: true })).toBeNull();
  });

  it("mentions alone carry no text, so they need “any reply”", () => {
    expect(storyTriggerProblem({ replies: false, mentions: true, anyReply: false })).toBe("mentionsNeedAnyReply");
  });
});

describe("choice cards", () => {
  const options = [
    { value: "all", title: "Todas", description: "Qualquer post" },
    { value: "posts", title: "Específicas", description: "Escolha na grade" },
    { value: "next", title: "Próxima", description: "Antes de postar" },
  ] as const;

  it("radio cards are one radiogroup of native radios sharing a name (arrow keys move and check)", () => {
    const html = renderToStaticMarkup(
      createElement(RadioCards<"all" | "posts" | "next">, {
        name: "post-scope",
        label: "Alguém comenta em",
        value: "posts",
        onChange: () => {},
        options: [...options],
      })
    );
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Alguém comenta em"');
    const radios = html.match(/<input[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    for (const input of radios) {
      expect(input).toContain('type="radio"');
      expect(input).toContain('name="post-scope"');
    }
    // Exactly one checked: the chosen option.
    expect(radios.filter((r) => /checked=""/.test(r))).toEqual([expect.stringContaining('value="posts"')]);
  });

  it("each card: mark, title as the name and the explanation as the description", () => {
    const html = renderToStaticMarkup(
      createElement(RadioCards<"all" | "posts" | "next">, { value: "all", onChange: () => {}, labelledBy: "x", options: [...options] })
    );
    const ids = (attr: string) => [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))].map((m) => m[1]);
    const titles = ids("aria-labelledby").filter((id) => id !== "x");
    const descriptions = ids("aria-describedby");
    expect(titles).toHaveLength(3);
    expect(descriptions).toHaveLength(3);
    for (const id of [...titles, ...descriptions]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("Qualquer post");
    // The group is named by the visible text it points to.
    expect(html).toContain('role="radiogroup" aria-labelledby="x"');
  });

  it("check cards are native checkboxes; both can be checked", () => {
    const html = renderToStaticMarkup(
      createElement(CheckCards<"replies" | "mentions">, {
        label: "Stories",
        values: ["replies", "mentions"],
        onChange: () => {},
        options: [
          { value: "replies", title: "Respostas aos stories" },
          { value: "mentions", title: "Marcações no story" },
        ],
      })
    );
    const boxes = html.match(/<input[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(2);
    for (const input of boxes) {
      expect(input).toContain('type="checkbox"');
      expect(input).toMatch(/checked=""/);
    }
    expect(html).not.toContain("radiogroup");
  });
});

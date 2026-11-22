/** One page of the account's media for the post grid (infinite scroll). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getUserMediaPage } from "../lib/meta/client";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getUserMediaPage", () => {
  it("asks for one page and returns the cursor of the next one", async () => {
    const fetchMock = stubFetch({
      data: [{ id: "m1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-11-01T00:00:00Z" }],
      paging: { cursors: { after: "CURSOR_2" }, next: "https://graph.instagram.com/next" },
    });
    const page = await getUserMediaPage("token", { limit: 24 });
    expect(page).toEqual({ data: [expect.objectContaining({ id: "m1" })], nextCursor: "CURSOR_2" });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("limit")).toBe("24");
    expect(url.searchParams.get("after")).toBeNull();
    expect(url.searchParams.get("fields")).toContain("media_product_type");
  });

  it("passes the cursor back as `after`", async () => {
    const fetchMock = stubFetch({ data: [{ id: "m25", media_type: "IMAGE", timestamp: "2026-10-01T00:00:00Z" }] });
    await getUserMediaPage("token", { limit: 24, after: "CURSOR_2" });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("after")).toBe("CURSOR_2");
  });

  it("has no next cursor on the last page", async () => {
    stubFetch({ data: [{ id: "m99", media_type: "IMAGE", timestamp: "2020-01-01T00:00:00Z" }], paging: { cursors: { after: "X" } } });
    expect((await getUserMediaPage("token", {})).nextCursor).toBeNull();
    stubFetch({ data: [], paging: { cursors: { after: "X" }, next: "https://graph.instagram.com/next" } });
    expect((await getUserMediaPage("token", {})).nextCursor).toBeNull();
  });
});

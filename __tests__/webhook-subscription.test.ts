import { afterEach, describe, expect, it, vi } from "vitest";
import { getInstagramAccountSubscriptions, subscribeInstagramAccountToWebhooks, WEBHOOK_FIELDS } from "@/lib/meta/client";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const fieldsOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string).subscribed_fields;

describe("account webhook subscription (Instagram's login, graph.instagram.com)", () => {
  it("subscribes comments, DMs, button taps and echoes (no read receipts)", async () => {
    const fetchMock = mockFetch({ status: 200, body: { success: true } });
    await expect(subscribeInstagramAccountToWebhooks("ig1", "token")).resolves.toEqual({
      success: true,
      fields: ["comments", "messages", "messaging_postbacks", "message_echoes"],
    });
    expect(fieldsOf(fetchMock.mock.calls[0])).toEqual([...WEBHOOK_FIELDS]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/graph\.instagram\.com\/v[\d.]+\/ig1\/subscribed_apps$/);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer token" });
  });

  it("drops a field Meta refuses, one step at a time, keeping comments and DMs", async () => {
    const refused = { status: 400, body: { error: { message: "(#100) Param subscribed_fields must be one of ...", type: "OAuthException", code: 100 } } };
    const fetchMock = mockFetch(refused, refused, { status: 200, body: { success: true } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(subscribeInstagramAccountToWebhooks("ig1", "token")).resolves.toEqual({ success: true, fields: ["comments", "messages"] });
    expect(fetchMock.mock.calls.map(fieldsOf)).toEqual([
      ["comments", "messages", "messaging_postbacks", "message_echoes"],
      ["comments", "messages", "messaging_postbacks"],
      ["comments", "messages"],
    ]);
  });

  it("does not retry an invalid token", async () => {
    const fetchMock = mockFetch({ status: 400, body: { error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } } });
    await expect(subscribeInstagramAccountToWebhooks("ig1", "token")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads what Meta confirms for the account (apps and fields)", async () => {
    const fetchMock = mockFetch({ status: 200, body: { data: [{ id: "123", name: "App", subscribed_fields: ["comments", { name: "messages" }] }, { subscribed_fields: "x" }] } });
    await expect(getInstagramAccountSubscriptions("ig1", { accessToken: "igtoken" })).resolves.toEqual([
      { id: "123", name: "App", fields: ["comments", "messages"] },
      { id: null, name: null, fields: [] },
    ]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/graph\.instagram\.com\/v[\d.]+\/ig1\/subscribed_apps\?access_token=igtoken$/);
  });
});

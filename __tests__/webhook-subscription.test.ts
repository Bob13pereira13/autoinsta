import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeInstagramAccountToWebhooks, WEBHOOK_FIELDS } from "@/lib/meta/client";

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

describe("account webhook subscription", () => {
  it("subscribes comments, DMs, button taps and read receipts", async () => {
    const fetchMock = mockFetch({ status: 200, body: { success: true } });
    await expect(subscribeInstagramAccountToWebhooks("ig1", "token")).resolves.toEqual({ success: true });
    expect(fieldsOf(fetchMock.mock.calls[0])).toEqual([...WEBHOOK_FIELDS]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/graph\.instagram\.com\/v[\d.]+\/ig1\/subscribed_apps$/);
  });

  it("uses graph.facebook.com for Unified login tokens", async () => {
    const fetchMock = mockFetch({ status: 200, body: { success: true } });
    await subscribeInstagramAccountToWebhooks("ig1", { accessToken: "suat", unifiedLogin: true });
    expect(fetchMock.mock.calls[0][0]).toMatch(/graph\.facebook\.com\/v[\d.]+\/ig1\/subscribed_apps$/);
  });

  it("falls back to comments + messages when Meta rejects an extra field", async () => {
    const fetchMock = mockFetch(
      { status: 400, body: { error: { message: "(#100) Param subscribed_fields must be one of ...", type: "OAuthException", code: 100 } } },
      { status: 200, body: { success: true } }
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(subscribeInstagramAccountToWebhooks("ig1", "token")).resolves.toEqual({ success: true });
    expect(fieldsOf(fetchMock.mock.calls[1])).toEqual(["comments", "messages"]);
  });

  it("does not retry an invalid token", async () => {
    const fetchMock = mockFetch({ status: 400, body: { error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } } });
    await expect(subscribeInstagramAccountToWebhooks("ig1", "token")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

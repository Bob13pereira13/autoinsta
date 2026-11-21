import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));

import { setLocale } from "../lib/i18n/actions";
import { getI18n } from "../lib/i18n/server";
import { LOCALE_COOKIE } from "../lib/i18n";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("language preference", () => {
  it("renders a saved language on the server before hydration", async () => {
    store.get.mockReturnValue({ value: "en" });
    const { locale, t } = await getI18n();
    expect(store.get).toHaveBeenCalledWith(LOCALE_COOKIE);
    expect(locale).toBe("en");
    expect(t("Settings")).toBe("Settings");
  });

  it("renders Brazilian Portuguese when no language was saved", async () => {
    store.get.mockReturnValue(undefined);
    const { locale, t } = await getI18n();
    expect(locale).toBe("pt-BR");
    expect(t("Settings")).toBe("Configurações");
  });

  it("falls back to Brazilian Portuguese for an invalid cookie", async () => {
    store.get.mockReturnValue({ value: "zh-TW" });
    expect((await getI18n()).locale).toBe("pt-BR");
  });

  it("persists only the language cookie, across routes and browser restarts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setLocale("en");
    expect(store.set).toHaveBeenCalledExactlyOnceWith(LOCALE_COOKIE, "en", {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      httpOnly: true,
      secure: true,
    });
  });

  it("allows switching back to Portuguese during local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setLocale("pt-BR");
    expect(store.set).toHaveBeenCalledWith(
      LOCALE_COOKIE,
      "pt-BR",
      expect.objectContaining({ secure: false }),
    );
  });

  it("rejects an unsupported locale without writing cookies", async () => {
    await expect(setLocale("en; path=/")).rejects.toThrow("Unsupported locale");
    expect(store.set).not.toHaveBeenCalled();
  });
});

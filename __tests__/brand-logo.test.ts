/**
 * The logo: one file per theme (dark-coloured on the light theme, light-
 * coloured on the dark theme), the same artwork in both, and every page's
 * BrandMark rendering both with the CSS classes that pick one per theme.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import BrandMark from "@/components/brand-mark";

const file = (src: string) => path.join(__dirname, "..", "public", src);
const colors = (svg: string) => [...new Set(svg.match(/#[0-9a-f]{6}/gi)?.map((c) => c.toUpperCase()))];

describe("logo files", () => {
  it("exist for both themes", () => {
    expect(existsSync(file(brand.logo.light))).toBe(true);
    expect(existsSync(file(brand.logo.dark))).toBe(true);
  });

  it("light theme: dark ink #111827; dark theme: light ink", () => {
    expect(colors(readFileSync(file(brand.logo.light), "utf8"))).toEqual(["#111827"]);
    expect(colors(readFileSync(file(brand.logo.dark), "utf8"))).toEqual(["#F9FAFB"]);
  });

  it("the same artwork in both (only the colour changes)", () => {
    const light = readFileSync(file(brand.logo.light), "utf8").replace(/#[0-9a-f]{6}/gi, "C");
    const dark = readFileSync(file(brand.logo.dark), "utf8").replace(/#[0-9a-f]{6}/gi, "C");
    expect(dark).toBe(light);
    expect(light).toContain('aria-label="ChatIntegrAI"');
  });

  it("the configured proportion matches the artwork", () => {
    const viewBox = readFileSync(file(brand.logo.light), "utf8").match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    expect([Number(viewBox[1]), Number(viewBox[2])]).toEqual([brand.logo.width, brand.logo.height]);
  });
});

describe("BrandMark", () => {
  it("renders both versions, each shown only in its theme", () => {
    const html = renderToStaticMarkup(createElement(BrandMark, { size: "lg" }));
    expect(html).toMatch(/<img[^>]*class="show-in-light[^"]*"[^>]*src="\/brand\/logo-light.svg"|<img[^>]*src="\/brand\/logo-light.svg"[^>]*class="show-in-light/);
    expect(html).toMatch(/<img[^>]*class="show-in-dark[^"]*"[^>]*src="\/brand\/logo-dark.svg"|<img[^>]*src="\/brand\/logo-dark.svg"[^>]*class="show-in-dark/);
    // Height per size, width from the proportion (40 → 193).
    expect(html).toContain('height="40"');
    expect(html).toContain('width="193"');
  });

  it("is a labelled link home, or a labelled image without a link; the name is not repeated as text", () => {
    const link = renderToStaticMarkup(createElement(BrandMark, {}));
    // The brand name alone: the same in every interface language.
    expect(link).toContain('aria-label="ChatIntegrAI"');
    expect(link).toContain('href="/"');
    expect(link.match(/alt=""/g)).toHaveLength(2);
    const plain = renderToStaticMarkup(createElement(BrandMark, { href: null, size: "sm" }));
    expect(plain).toContain('role="img"');
    expect(plain).toContain('aria-label="ChatIntegrAI"');
    expect(plain).not.toContain("<a ");
    // Only the logo: no separate brand-name text next to it.
    expect(plain.replace(/<[^>]+>/g, "")).toBe("");
  });
});

/**
 * Themes (app/globals.css): both copies of the dark theme stay identical,
 * light and dark define the same tokens, every text/background pair the
 * panel uses reaches 4.5:1 (WCAG AA), and components never hard-code colors.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brand } from "../config/brand";

const root = path.join(__dirname, "..");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return vars;
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const systemDark = block(':root:not([data-theme="light"])');

type RGBA = [number, number, number, number];
function parse(value: string): RGBA {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = value.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  // The dark card is a gradient: use its lighter (top) stop, the worst case for light text.
  const gradient = value.match(/linear-gradient\([^,]+,\s*(rgba\([^)]+\))/);
  if (gradient) return parse(gradient[1]);
  throw new Error(`Cannot parse color ${value}`);
}
function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top[3];
  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}
function luminance([r, g, b]: RGBA): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a background token to a solid color (translucent layers composed over their parents). */
function solid(theme: Record<string, string>, layers: string[]): RGBA {
  const shared: Record<string, string> = { accent: brand.colors.primary, "accent-2": "#c026d3", danger: theme.danger, scrim: "rgba(0, 0, 0, 0.55)" };
  return layers.reduce<RGBA>((acc, name) => over(parse(shared[name] ?? theme[name] ?? name), acc), [255, 255, 255, 1]);
}
function fg(theme: Record<string, string>, name: string): RGBA {
  const value = theme[name] ?? name;
  return parse(value);
}

// [text token, background layers from the page up]
const PAIRS: [string, string[]][] = [
  ...["text", "heading", "text-2", "text-3", "accent-fg"].flatMap((t) => [
    [t, ["bg"]],
    [t, ["bg", "card"]],
    [t, ["bg", "card", "surface"]],
    [t, ["bg", "sidebar"]],
    [t, ["dialog"]],
  ] as [string, string[]][]),
  ["text-2", ["bg", "control"]],
  ["text-2", ["bg", "sidebar", "nav-active"]],
  ["heading", ["bg", "sidebar", "nav-active"]],
  ["text", ["bg", "card", "input"]],
  ["placeholder", ["bg", "card", "input"]],
  ["placeholder", ["bg", "input"]],
  ["accent-soft-fg", ["bg", "accent-soft"]],
  ["accent-soft-fg", ["bg", "card", "accent-soft"]],
  ["accent-soft-fg", ["bg", "card", "chip"]],
  ["heading", ["bg", "summary"]],
  ["accent-fg", ["bg", "summary"]],
  ["text", ["preview", "bubble-in"]],
  ["text-2", ["preview"]],
  ["success", ["bg", "card"]],
  ["success", ["bg", "card", "success-soft"]],
  ["warning", ["bg", "card"]],
  ["warning", ["bg", "card", "warning-soft"]],
  ["error", ["bg", "card"]],
  ["error", ["bg", "card", "error-soft"]],
  ["error", ["dialog", "error-soft"]],
  ["#ffffff", ["accent"]],
  ["#ffffff", ["accent-2"]],
  ["#ffffff", ["danger"]],
  ["#ffffff", ["danger-hover"]],
  // White text over a white photo darkened by the scrim (the worst case).
  ["#ffffff", ["#ffffff", "scrim"]],
];

afterEach(() => vi.unstubAllEnvs());

describe("themes", () => {
  it("keeps the two copies of the dark theme identical", () => {
    expect(systemDark).toEqual(dark);
  });

  it("defines the same tokens in light and dark", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(Object.keys(light).length).toBeGreaterThan(50);
  });

  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    it(`reaches 4.5:1 for every text/background pair in the ${name} theme`, () => {
      const failures = PAIRS.map(([text, layers]) => {
        const ratio = contrast(fg(theme, text), solid(theme, layers));
        return { pair: `${text} on ${layers.join(" > ")}`, ratio: Math.round(ratio * 100) / 100 };
      }).filter((r) => r.ratio < 4.5);
      expect(failures).toEqual([]);
    });
  }

  it("the brand color takes white text at 4.5:1", () => {
    expect(contrast([255, 255, 255, 1], parse(brand.colors.primary))).toBeGreaterThanOrEqual(4.5);
    expect(contrast([255, 255, 255, 1], parse(brand.colors.primaryHover))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("no hard-coded colors in the panel", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "generated" || name === "fonts" ? [] : files(full);
      return /\.tsx$/.test(name) ? [full] : [];
    });
  const sources = [...files(path.join(root, "app")), ...files(path.join(root, "components"))];
  const PALETTE =
    /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|decoration|placeholder|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

  it("uses only theme tokens (no hex, rgb or Tailwind palette colors)", () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(line.replace(/href="#[^"]*"|`#[^`]*`|"#[\w-]*"/g, "")) || /rgba?\(/.test(line) || PALETTE.test(line)) {
          offenders.push(`${path.relative(root, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("theme choice", () => {
  it("is stored in a long-lived, http-only cookie and only for known themes", async () => {
    const set = vi.fn();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ set }) }));
    const { setTheme } = await import("../lib/theme/actions");
    await setTheme("dark");
    expect(set).toHaveBeenCalledWith("app-theme", "dark", expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 }));
    await expect(setTheme("blue")).rejects.toThrow();
    expect(set).toHaveBeenCalledTimes(1);
    vi.doUnmock("next/headers");
  });

  it("an unknown cookie value means: follow the system", async () => {
    const { resolveTheme } = await import("../lib/theme");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("purple")).toBeNull();
    expect(resolveTheme(undefined)).toBeNull();
  });
});

/**
 * App icons, made from docs/design/app-icon.svg (the icon sent to Meta): the
 * logo's symbol in white on a solid square in `brand.colors.iconBackground`,
 * nothing transparent, no rounded corners (iOS and Android round them). The
 * symbol sits where the SVG puts it, with room for round cuts; the maskable
 * icon keeps it inside Android's safe zone (a circle of 40% of the side),
 * reduced only if it would not fit; the favicon enlarges it to be legible at
 * 16 px. The PNGs are decoded here with zlib only, so no image library is needed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { brand } from "@/config/brand";

const root = path.join(__dirname, "..");
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// The icons' own background (not the panel's primary colour).
const BG = rgb(brand.colors.iconBackground);
const svg = readFileSync(path.join(root, "docs/design/app-icon.svg"), "utf8");

/**
 * Where the symbol is in the SVG, as a share of the side: the symbol's own
 * extent in its 100-unit box (the bubble's ring of radius 30 + half its 17
 * stroke around (48, 48), the tail's tip at (10, 92), the sparkle's tip at x
 * 95), moved by the SVG's transform.
 */
const SYMBOL_EXTENT = { x0: 9.5, y0: 9.5, x1: 95, y1: 92 };
const [, tx, ty, scale] = svg.match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!.map(Number);
const DESIGN = {
  x0: (tx + SYMBOL_EXTENT.x0 * scale) / 100,
  y0: (ty + SYMBOL_EXTENT.y0 * scale) / 100,
  x1: (tx + SYMBOL_EXTENT.x1 * scale) / 100,
  y1: (ty + SYMBOL_EXTENT.y1 * scale) / 100,
};

type Decoded = { width: number; height: number; colorType: number; transparentChunk: boolean; pixel: (x: number, y: number) => number[] };

/** 8-bit, non-interlaced RGB (2) or RGBA (6) PNG. */
function decodePng(buf: Buffer): Decoded {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let offset = 8;
  let width = 0, height = 0, colorType = 0, depth = 0, interlace = 0, transparentChunk = false;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "tRNS") transparentChunk = true;
    offset += 12 + length;
  }
  expect(depth).toBe(8);
  expect(interlace).toBe(0);
  const channels = colorType === 6 ? 4 : 3;
  expect([2, 6]).toContain(colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels] : 0;
      let v = x;
      if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + i] = v & 0xff;
    }
  }
  return { width, height, colorType, transparentChunk, pixel: (x, y) => [...out.subarray(y * stride + x * channels, y * stride + x * channels + channels)] };
}

/**
 * Where the symbol is: every pixel clearly off the background (antialiased
 * edges included), its box in pixels and its farthest point from the centre
 * (share of the side). `white` = the symbol is drawn in pure white somewhere.
 */
function symbolOf(png: Decoded) {
  let far = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, white = false;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const p = png.pixel(x, y);
      if (p[0] === 255 && p[1] === 255 && p[2] === 255) white = true;
      if (Math.max(...[0, 1, 2].map((i) => Math.abs(p[i] - BG[i]))) > 48) {
        far = Math.max(far, Math.hypot(x + 0.5 - png.width / 2, y + 0.5 - png.height / 2) / png.width);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      }
    }
  }
  return { far, box: { x0, y0, x1, y1 }, white, found: x1 >= 0 };
}

/** Solid background in every corner, nothing transparent anywhere, a white symbol. */
function expectSolid(png: Decoded, size: number) {
  expect([png.width, png.height]).toEqual([size, size]);
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    expect(png.pixel(x, y).slice(0, 3)).toEqual(BG);
    if (png.colorType === 6) expect(png.pixel(x, y)[3]).toBe(255);
  }
  if (png.colorType === 6) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) expect(png.pixel(x, y)[3]).toBe(255);
  }
  const symbol = symbolOf(png);
  expect(symbol.found).toBe(true);
  expect(symbol.white).toBe(true);
  return symbol;
}

/** The symbol where the SVG puts it (within 1.5 px), inside the round cut. */
function expectDesign(png: Decoded, size: number) {
  const symbol = expectSolid(png, size);
  for (const edge of ["x0", "y0", "x1", "y1"] as const) {
    expect(Math.abs(symbol.box[edge] - DESIGN[edge] * size), edge).toBeLessThanOrEqual(1.5);
  }
  expect(symbol.far).toBeLessThanOrEqual(0.4);
  return symbol;
}

const png = (rel: string) => decodePng(readFileSync(path.join(root, rel)));

describe("app icons", () => {
  it("the design: docs/design/app-icon.svg is the logo's symbol, white, on the icon background, square corners", () => {
    const logo = readFileSync(path.join(root, "public/brand/logo-light.svg"), "utf8");
    const paths = (text: string) => [...text.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths(svg)).toEqual(paths(logo).slice(0, 3));
    expect(svg).toContain(`<rect width="100" height="100" fill="${brand.colors.iconBackground}"/>`);
    expect(svg).not.toMatch(/rx=/);
    expect(svg.match(/fill="#FFFFFF"|stroke="#FFFFFF"/g)).toHaveLength(3);
    // The icon background is its own colour: the panel keeps the primary.
    expect(brand.colors.iconBackground).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each([
    ["docs/design/app-icon-1024.png", 1024],
    ["public/icon-512.png", 512],
    ["public/icon-192.png", 192],
    ["public/apple-touch-icon.png", 180],
  ])("%s: %ipx, RGB without transparency, the symbol where the design puts it", (file, size) => {
    const icon = png(file);
    expect(icon.colorType).toBe(2); // RGB, no alpha channel
    expect(icon.transparentChunk).toBe(false);
    expectDesign(icon, size);
  });

  it("maskable: inside Android's safe zone (40% circle), reduced only if it had to be", () => {
    const icon = png("public/icon-maskable-512.png");
    expect(icon.colorType).toBe(2);
    expect(icon.transparentChunk).toBe(false);
    const maskable = expectSolid(icon, 512);
    expect(maskable.far).toBeLessThanOrEqual(0.4);
    // The design already fits the safe zone, so it is not reduced: same size as icon-512.
    const regular = symbolOf(png("public/icon-512.png"));
    expect(regular.far).toBeLessThanOrEqual(0.4);
    expect(maskable.box.x1 - maskable.box.x0).toBeGreaterThanOrEqual(regular.box.x1 - regular.box.x0 - 1);
  });

  it("favicon.ico: 16, 32 and 48, each solid, the symbol larger than in the app icons and inside the square", () => {
    const ico = readFileSync(path.join(root, "app/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // icon
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const size = ico[entry] || 256;
      const length = ico.readUInt32LE(entry + 8);
      const start = ico.readUInt32LE(entry + 12);
      sizes.push(size);
      const { box } = expectSolid(decodePng(ico.subarray(start, start + length)), size);
      // Legible in a tab: wider than in the app icons (53% of the side)…
      expect((box.x1 - box.x0) / size).toBeGreaterThanOrEqual(0.7);
      // …and still at least a pixel from every edge (tabs do not cut the square).
      expect(Math.min(box.x0, box.y0, size - box.x1, size - box.y1)).toBeGreaterThanOrEqual(1);
    }
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });

  it("the manifest: splash on the icon background, the bar in the brand's colour, files that exist", () => {
    const m = manifest();
    expect(m.background_color).toBe(brand.colors.iconBackground);
    expect(m.theme_color).toBe(brand.colors.theme);
    expect(existsSync(path.join(root, "docs/design/logo-1024.png"))).toBe(false);
    const icons = m.icons ?? [];
    expect(icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
    for (const icon of icons) expect(existsSync(path.join(root, "public", icon.src))).toBe(true);
  });
});

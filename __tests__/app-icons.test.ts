/**
 * App icons, made from the new logo's symbol: white symbol centred on a solid
 * square in the brand's primary colour (#7C3AED), nothing transparent, with room for round cuts (iOS rounds
 * the corners, Android launchers cut circles). The maskable icon keeps the
 * symbol inside Android's safe zone (a circle of 40% of the side). The PNGs
 * are decoded here with zlib only, so no image library is needed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { brand } from "@/config/brand";

const root = path.join(__dirname, "..");
// The brand's primary colour (#7C3AED).
const BG = [1, 3, 5].map((i) => parseInt(brand.colors.primary.slice(i, i + 2), 16));

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

/** Where the white symbol is: its farthest pixel from the centre (share of the side) and its offset. */
function symbolOf(png: Decoded) {
  let far = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = png.pixel(x, y);
      if (r > 200 && g > 200 && b > 200) {
        far = Math.max(far, Math.hypot(x + 0.5 - png.width / 2, y + 0.5 - png.height / 2) / png.width);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  return { far, dx: (x0 + x1 + 1) / 2 - png.width / 2, dy: (y0 + y1 + 1) / 2 - png.height / 2, found: x1 >= 0 };
}

function expectIcon(png: Decoded, size: number, maxRadius: number) {
  expect([png.width, png.height]).toEqual([size, size]);
  // Solid background in every corner, and nothing transparent anywhere.
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    expect(png.pixel(x, y).slice(0, 3)).toEqual(BG);
    if (png.colorType === 6) expect(png.pixel(x, y)[3]).toBe(255);
  }
  if (png.colorType === 6) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) expect(png.pixel(x, y)[3]).toBe(255);
  }
  const symbol = symbolOf(png);
  expect(symbol.found).toBe(true);
  expect(symbol.far).toBeLessThanOrEqual(maxRadius);
  expect(Math.abs(symbol.dx)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(symbol.dy)).toBeLessThanOrEqual(1.5);
}

const png = (rel: string) => decodePng(readFileSync(path.join(root, rel)));

describe("app icons", () => {
  // Inside the inscribed circle (0.5) with margin, for round cuts.
  it.each([
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["public/apple-touch-icon.png", 180],
  ])("%s: %ipx, solid, symbol inside the round cut", (file, size) => {
    const icon = png(file);
    expect(icon.colorType).toBe(2); // RGB, no alpha channel
    expect(icon.transparentChunk).toBe(false);
    expectIcon(icon, size, 0.4);
  });

  it("maskable: symbol inside Android's safe zone (40% circle) with margin", () => {
    const icon = png("public/icon-maskable-512.png");
    expect(icon.colorType).toBe(2);
    expectIcon(icon, 512, 0.34);
  });

  it("Meta's app icon: 1024x1024 PNG without transparency", () => {
    const icon = png("docs/design/app-icon-1024.png");
    expect(icon.colorType).toBe(2);
    expect(icon.transparentChunk).toBe(false);
    expectIcon(icon, 1024, 0.4);
  });

  it("favicon.ico: 16, 32 and 48, each solid with the symbol centred", () => {
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
      expectIcon(decodePng(ico.subarray(start, start + length)), size, 0.47);
    }
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });

  it("the old logo picture is gone, and the manifest points at files that exist", () => {
    expect(existsSync(path.join(root, "docs/design/logo-1024.png"))).toBe(false);
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
    for (const icon of icons) expect(existsSync(path.join(root, "public", icon.src))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  detectMedia,
  isStorageKey,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MediaValidationError,
  resolveMediaPath,
  validateMedia,
} from "@/lib/media/storage";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp" + brand, "latin1"), Buffer.alloc(8)]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
const pad = (head: Buffer, size: number) => Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length))]);

describe("type detection by content", () => {
  it("recognises PNG, JPEG, MP4, MOV and WEBM", () => {
    expect(detectMedia(PNG)).toMatchObject({ kind: "IMAGE", ext: "png", mimeType: "image/png" });
    expect(detectMedia(JPEG)).toMatchObject({ kind: "IMAGE", ext: "jpg", mimeType: "image/jpeg" });
    expect(detectMedia(ftyp("isom"))).toMatchObject({ kind: "VIDEO", ext: "mp4" });
    expect(detectMedia(ftyp("mp42"))).toMatchObject({ kind: "VIDEO", ext: "mp4" });
    expect(detectMedia(ftyp("qt  "))).toMatchObject({ kind: "VIDEO", ext: "mov", mimeType: "video/quicktime" });
    expect(detectMedia(WEBM)).toMatchObject({ kind: "VIDEO", ext: "webm" });
  });

  it("rejects formats Meta does not accept, whatever the file is called", () => {
    expect(detectMedia(ftyp("heic"))).toBeNull(); // iPhone photo
    expect(detectMedia(ftyp("avif"))).toBeNull();
    expect(detectMedia(Buffer.from("GIF89a....", "latin1"))).toBeNull();
    expect(detectMedia(Buffer.from("%PDF-1.7", "latin1"))).toBeNull();
    // A script renamed to foto.jpg is still a script.
    expect(detectMedia(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(() => validateMedia(Buffer.from("<html></html>"))).toThrow(MediaValidationError);
  });
});

describe("size limits", () => {
  it("allows images up to 8 MB and videos up to 25 MB", () => {
    expect(validateMedia(pad(PNG, MAX_IMAGE_BYTES)).sizeBytes).toBe(MAX_IMAGE_BYTES);
    expect(() => validateMedia(pad(PNG, MAX_IMAGE_BYTES + 1))).toThrow(/8 MB/);
    expect(validateMedia(pad(ftyp("isom"), MAX_VIDEO_BYTES)).kind).toBe("VIDEO");
    expect(() => validateMedia(pad(ftyp("isom"), MAX_VIDEO_BYTES + 1))).toThrow(/25 MB/);
    expect(() => validateMedia(Buffer.alloc(0))).toThrow(/empty/);
  });
});

describe("storage keys", () => {
  it("only resolves keys the app issued, never a path", () => {
    expect(isStorageKey("a".repeat(43) + ".jpg")).toBe(true);
    for (const bad of ["../../etc/passwd", "a".repeat(43) + ".jpg/../x", "a".repeat(43) + ".exe", "short.jpg", "a".repeat(43) + ".JPG"]) {
      expect(isStorageKey(bad), bad).toBe(false);
      expect(() => resolveMediaPath(bad)).toThrow();
    }
  });
});

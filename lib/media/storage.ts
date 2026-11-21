import { randomBytes } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";

/**
 * Images and videos uploaded from the dashboard for automation messages.
 *
 * Files live on the web server's disk in UPLOADS_DIR (a persistent volume in
 * production) and are served publicly at /media/<storageKey>, because Meta
 * downloads each attachment from a public URL when the DM is sent. Keys are 32
 * random bytes, so a URL cannot be guessed.
 *
 * Limits follow Meta's Instagram messaging docs: images PNG/JPEG up to 8 MB,
 * video MP4/MOV/WEBM up to 25 MB; at most 5 images and 1 video per message.
 * The type is decided by the file's content (magic bytes), never by its name
 * or by what the browser claims.
 */

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * MB;
export const MAX_VIDEO_BYTES = 25 * MB;
export const MAX_IMAGES_PER_MESSAGE = 5;
export const MAX_VIDEOS_PER_MESSAGE = 1;

export function workspaceQuotaBytes(): number {
  const mb = Number(process.env.MEDIA_WORKSPACE_QUOTA_MB ?? 500);
  return (Number.isFinite(mb) && mb > 0 ? mb : 500) * MB;
}

export type MediaKindName = "IMAGE" | "VIDEO";
export interface DetectedMedia {
  kind: MediaKindName;
  mimeType: string;
  ext: "png" | "jpg" | "mp4" | "mov" | "webm";
}

const EXT_MIME: Record<DetectedMedia["ext"], string> = {
  png: "image/png",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function mimeTypeForKey(storageKey: string): string | null {
  const ext = storageKey.split(".").pop() as DetectedMedia["ext"];
  return EXT_MIME[ext] ?? null;
}

// ISO BMFF brands that are video. HEIC/AVIF use the same container but are
// still images Meta does not accept, so they are rejected.
const QUICKTIME_BRANDS = new Set(["qt  "]);
const MP4_BRANDS = new Set(["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4VP", "dash", "mmp4", "MSNV", "3gp4", "3gp5", "3gp6"]);

/** Identify a file by its first bytes. Returns null for anything unsupported. */
export function detectMedia(buffer: Buffer): DetectedMedia | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: "IMAGE", mimeType: EXT_MIME.png, ext: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: "IMAGE", mimeType: EXT_MIME.jpg, ext: "jpg" };
  }
  if (buffer.length >= 12 && buffer.toString("latin1", 4, 8) === "ftyp") {
    const brand = buffer.toString("latin1", 8, 12);
    if (QUICKTIME_BRANDS.has(brand)) return { kind: "VIDEO", mimeType: EXT_MIME.mov, ext: "mov" };
    if (MP4_BRANDS.has(brand)) return { kind: "VIDEO", mimeType: EXT_MIME.mp4, ext: "mp4" };
    return null;
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { kind: "VIDEO", mimeType: EXT_MIME.webm, ext: "webm" };
  }
  return null;
}

export type MediaErrorCode = "empty" | "unsupported_type" | "image_too_large" | "video_too_large" | "quota_exceeded";

export class MediaValidationError extends Error {
  constructor(
    public readonly code: MediaErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export function validateMedia(buffer: Buffer): DetectedMedia & { sizeBytes: number } {
  if (buffer.length === 0) throw new MediaValidationError("empty", "The file is empty.");
  const detected = detectMedia(buffer);
  if (!detected) {
    throw new MediaValidationError(
      "unsupported_type",
      "Unsupported file. Use a PNG or JPEG image, or an MP4, MOV or WEBM video."
    );
  }
  if (detected.kind === "IMAGE" && buffer.length > MAX_IMAGE_BYTES) {
    throw new MediaValidationError("image_too_large", "Images can be at most 8 MB.");
  }
  if (detected.kind === "VIDEO" && buffer.length > MAX_VIDEO_BYTES) {
    throw new MediaValidationError("video_too_large", "Videos can be at most 25 MB.");
  }
  return { ...detected, sizeBytes: buffer.length };
}

export function getUploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "uploads"));
}

/** Created at build time in the Docker image and here at runtime if missing. */
export async function ensureUploadsDir(): Promise<string> {
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

const STORAGE_KEY = /^[A-Za-z0-9_-]{32,64}\.(png|jpg|mp4|mov|webm)$/;

export function isStorageKey(value: string): boolean {
  return STORAGE_KEY.test(value);
}

/** Absolute path of a stored file; refuses anything that is not a key we issued. */
export function resolveMediaPath(storageKey: string): string {
  if (!isStorageKey(storageKey)) throw new Error("Invalid media key");
  return path.join(getUploadsDir(), storageKey);
}

export async function workspaceMediaUsageBytes(workspaceId: string): Promise<number> {
  const usage = await prisma.automationMedia.aggregate({
    where: { workspaceId },
    _sum: { sizeBytes: true },
  });
  return usage._sum.sizeBytes ?? 0;
}

/**
 * Validate, check the workspace quota, write the file and record it (not yet
 * attached to an automation). The quota check and the insert are not one
 * transaction: two parallel uploads at the edge of the quota can both pass,
 * by at most one file — accepted for a soft per-workspace limit.
 */
export async function storeUpload({
  workspaceId,
  buffer,
  originalName,
}: {
  workspaceId: string;
  buffer: Buffer;
  originalName?: string | null;
}) {
  const media = validateMedia(buffer);
  const used = await workspaceMediaUsageBytes(workspaceId);
  if (used + media.sizeBytes > workspaceQuotaBytes()) {
    throw new MediaValidationError(
      "quota_exceeded",
      "Your media storage is full. Remove media from automations you no longer use and try again."
    );
  }

  const dir = await ensureUploadsDir();
  const storageKey = `${randomBytes(32).toString("base64url")}.${media.ext}`;
  await writeFile(path.join(dir, storageKey), buffer, { flag: "wx" });
  try {
    return await prisma.automationMedia.create({
      data: {
        workspaceId,
        kind: media.kind,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        storageKey,
        originalName: originalName?.slice(0, 200) || null,
      },
    });
  } catch (err) {
    await deleteMediaFiles([storageKey]);
    throw err;
  }
}

/** Remove files from disk; a file that is already gone is fine. */
export async function deleteMediaFiles(storageKeys: string[]): Promise<void> {
  await Promise.all(
    storageKeys.filter(isStorageKey).map(async (key) => {
      try {
        await unlink(resolveMediaPath(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn("[media] Could not delete file:", key, (err as Error).message);
        }
      }
    })
  );
}

/** Storage keys of every media file owned by these automations. */
export async function mediaKeysForAutomations(automationIds: string[]): Promise<string[]> {
  if (automationIds.length === 0) return [];
  const rows = await prisma.automationMedia.findMany({
    where: { automationId: { in: automationIds } },
    select: { storageKey: true },
  });
  return rows.map((row) => row.storageKey);
}

/** Storage keys of every media file of the automations of these Instagram accounts. */
export async function mediaKeysForAccounts(instagramAccountIds: string[]): Promise<string[]> {
  if (instagramAccountIds.length === 0) return [];
  const rows = await prisma.automationMedia.findMany({
    where: { automation: { instagramAccountId: { in: instagramAccountIds } } },
    select: { storageKey: true },
  });
  return rows.map((row) => row.storageKey);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup: uploads never attached to an automation (abandoned editor)
 * after 24h, and files on disk that no record references (e.g. a crash
 * between two steps). Files younger than an hour are left alone so an upload
 * in progress is never removed.
 */
export async function purgeStaleMedia(now = new Date()): Promise<{ unattached: number; orphanFiles: number }> {
  const stale = await prisma.automationMedia.findMany({
    where: { automationId: null, createdAt: { lt: new Date(now.getTime() - DAY_MS) } },
    select: { id: true, storageKey: true },
  });
  if (stale.length) {
    await prisma.automationMedia.deleteMany({ where: { id: { in: stale.map((m) => m.id) } } });
    await deleteMediaFiles(stale.map((m) => m.storageKey));
  }

  let orphanFiles = 0;
  let names: string[] = [];
  try {
    names = await readdir(getUploadsDir());
  } catch {
    return { unattached: stale.length, orphanFiles };
  }
  const candidates = names.filter(isStorageKey);
  if (candidates.length) {
    const known = new Set(
      (
        await prisma.automationMedia.findMany({
          where: { storageKey: { in: candidates } },
          select: { storageKey: true },
        })
      ).map((m) => m.storageKey)
    );
    for (const name of candidates) {
      if (known.has(name)) continue;
      try {
        const info = await stat(resolveMediaPath(name));
        if (now.getTime() - info.mtimeMs < 60 * 60 * 1000) continue;
      } catch {
        continue;
      }
      await deleteMediaFiles([name]);
      orphanFiles++;
    }
  }
  return { unattached: stale.length, orphanFiles };
}

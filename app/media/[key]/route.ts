import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db/client";
import { isStorageKey, mimeTypeForKey, resolveMediaPath } from "@/lib/media/storage";

/**
 * Public URL of an uploaded image/video. Meta downloads attachments from here
 * when a DM is sent, so it cannot require a login; keys are 32 random bytes
 * and only files with a database record are served (a deleted record — LGPD
 * request, disconnected account — stops serving even before the file is gone).
 * Supports HTTP Range for video players and resumable downloads.
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

async function serve(request: Request, key: string, headOnly: boolean): Promise<Response> {
  if (!isStorageKey(key)) return notFound();
  const known = await prisma.automationMedia.findUnique({ where: { storageKey: key }, select: { id: true } });
  if (!known) return notFound();

  const filePath = resolveMediaPath(key);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return notFound();
  }

  const headers = new Headers({
    "Content-Type": mimeTypeForKey(key) ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  });

  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    if (headOnly) return new Response(null, { status: 206, headers });
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  if (headOnly) return new Response(null, { status: 200, headers });
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  return serve(request, (await params).key, false);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ key: string }> }) {
  return serve(request, (await params).key, true);
}
